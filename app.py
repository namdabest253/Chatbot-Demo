# app.py
from flask import Flask, request, render_template, jsonify
from google import genai
from google.genai import types
from google.api_core import retry
import pandas as pd
import chromadb
from chromadb.config import Settings
import os
import logging
import json
import glob
from werkzeug.utils import secure_filename
import tempfile
import shutil

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Define a helper to retry when per-minute quota is reached.
is_retriable = lambda e: (isinstance(e, genai.errors.APIError) and e.code in {429, 503})

class GeminiEmbeddingFunction(chromadb.EmbeddingFunction): # Inherit from chromadb.EmbeddingFunction directly
    def __init__(self, api_key=None):
        self.document_mode = True
        self.api_key = api_key

    @retry.Retry(predicate=is_retriable)
    def __call__(self, input: chromadb.Documents) -> chromadb.Embeddings:
        if not self.api_key:
            raise ValueError("API key is required for embeddings")
            
        try:
            client = genai.Client(api_key=self.api_key)
            
            if self.document_mode:
                embedding_task = "retrieval_document"
            else:
                embedding_task = "retrieval_query"

            response = client.models.embed_content(
                model="models/text-embedding-004",
                contents=input,
                config=types.EmbedContentConfig(
                    task_type=embedding_task,
                ),
            )
            return [e.values for e in response.embeddings]
        except Exception as e:
            logger.error(f"Embedding error: {e}")
            raise

# Initialize ChromaDB with disabled telemetry and anonymous usage stats
try:
    chroma_client = chromadb.Client(Settings(
        anonymized_telemetry=False,
        allow_reset=True
    ))
except Exception as e:
    # Fallback to basic client if settings don't work
    logger.warning(f"ChromaDB settings failed, using basic client: {e}")
    chroma_client = chromadb.Client()

# Global dictionaries to track loaded universities and their data
loaded_universities = {}
university_data = {}

# Expected CSV column names for validation
EXPECTED_COLUMNS = ['rec_id','uni_id', 'uni_name', 'dept_id', 'dept_name','description','rec_url','date_created','date_modified', 'user_rating', 'tags', 'rec_content']

def preload_csv_files():
    """Preload all CSV files from the data directory at startup"""
    data_dir = os.path.join(os.path.dirname(__file__), 'data')
    
    if not os.path.exists(data_dir):
        logger.warning(f"Data directory not found: {data_dir}")
        return
    
    # Find all CSV files in the data directory
    csv_files = glob.glob(os.path.join(data_dir, '*.csv'))
    
    for csv_file in csv_files:
        # Skip Zone.Identifier files and other non-data files
        if 'Zone.Identifier' in csv_file or csv_file.endswith('.tmp'):
            continue
            
        try:
            logger.info(f"Loading CSV file: {csv_file}")
            
            # Read CSV with expected column names
            df = pd.read_csv(csv_file, names=EXPECTED_COLUMNS)
            
            # Validate CSV structure
            is_valid, message = validate_csv_structure(df)
            if not is_valid:
                logger.warning(f"Skipping invalid CSV file {csv_file}: {message}")
                continue
            
            # Extract university name from the uni_name column
            university_name = df['uni_name'].iloc[1] if not df.empty else "Unknown University"
            university_name = str(university_name).strip()
            
            # Check if university already exists
            if university_name in university_data:
                logger.info(f"University '{university_name}' already loaded, skipping duplicate")
                continue
            
            # Store university data
            university_data[university_name] = {
                'name': university_name,
                'data': df
            }
            
            logger.info(f"Successfully preloaded university: {university_name} with {len(df)} records")
            
        except Exception as e:
            logger.error(f"Error loading CSV file {csv_file}: {e}")
            continue
    
    logger.info(f"Preloaded {len(university_data)} universities from data directory")

def validate_csv_structure(df):
    """Validate that uploaded CSV has the correct structure"""
    if df.empty:
        return False, "CSV file is empty"
    
    # Check if all expected columns are present
    missing_columns = set(EXPECTED_COLUMNS) - set(df.columns)
    if missing_columns:
        return False, f"Missing required columns: {', '.join(missing_columns)}"
    
    # Check if required fields have data
    if df['uni_name'].isna().all():
        return False, "University name column is empty"
    
    if df['rec_content'].isna().all():
        return False, "Content column is empty"
    
    return True, "Valid CSV structure"

def get_or_create_collection(api_key, university_name):
    """Get or create ChromaDB collection for specific university"""
    collection_name = f"uni_{secure_filename(university_name).replace(' ', '_').lower()}"
    
    try:
        embed_fn = GeminiEmbeddingFunction(api_key=api_key)
        embed_fn.document_mode = True
        
        # Try to get existing collection first
        try:
            db = chroma_client.get_collection(name=collection_name)
            # Update the embedding function
            db._embedding_function = embed_fn
            logger.info(f"Retrieved existing ChromaDB collection for {university_name}")
        except Exception:
            # Create new collection if it doesn't exist
            logger.info(f"Creating new ChromaDB collection for {university_name}")
            db = chroma_client.create_collection(name=collection_name, embedding_function=embed_fn)
        
        # Add documents if collection is empty and we have data for this university
        if university_name in university_data and db.count() == 0:
            uni_data = university_data[university_name]
            student_department_id = '0'  # Default department
            df = uni_data['data']
            
            # Filter data for the department
            dept_data = df.loc[df['dept_id'] == student_department_id]
            
            # Combine content and URL for storage and retrieval
            documents = []
            metadatas = []
            for _, row in dept_data.iterrows():
                content = str(row['rec_content']) if pd.notna(row['rec_content']) else ""
                url = str(row['rec_url']) if pd.notna(row['rec_url']) else ""
                
                # Store content for embedding but keep URL in metadata
                documents.append(content)
                metadatas.append({
                    'rec_url': url,
                    'rec_id': str(row['rec_id']) if pd.notna(row['rec_id']) else "",
                    'description': str(row['description']) if pd.notna(row['description']) else ""
                })
            
            if documents:
                logger.info(f"Adding {len(documents)} documents to ChromaDB for {university_name}")
                try:
                    db.add(
                        documents=documents, 
                        metadatas=metadatas,
                        ids=[f"{university_name}_{i}" for i in range(len(documents))]
                    )
                    loaded_universities[university_name] = True
                    logger.info(f"Successfully added documents for {university_name}")
                except Exception as e:
                    logger.error(f"Error adding documents for {university_name}: {e}")
        else:
            logger.info(f"ChromaDB already contains documents for {university_name}")
        
        return db
        
    except Exception as e:
        logger.error(f"ChromaDB collection error for {university_name}: {e}")
        raise Exception(f"Database initialization failed for {university_name}. Please try again.")

# --- Flask Routes ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/universities', methods=['GET'])
def get_universities():
    """Get list of available universities"""
    universities = []
    for name, data in university_data.items():
        universities.append({
            'name': name,
            'document_count': len(data['data']) if 'data' in data else 0
        })
    return jsonify({"universities": universities})

@app.route('/api/universities/upload', methods=['POST'])
def upload_university():
    """Upload a new university CSV file"""
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    if not file.filename.lower().endswith('.csv'):
        return jsonify({"error": "Only CSV files are allowed"}), 400
    
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(mode='w+b', suffix='.csv', delete=False) as temp_file:
            file.save(temp_file.name)
            
            # Read and validate CSV
            df = pd.read_csv(temp_file.name, names=EXPECTED_COLUMNS)
            is_valid, message = validate_csv_structure(df)
            
            if not is_valid:
                os.unlink(temp_file.name)  # Clean up temp file
                return jsonify({"error": f"Invalid CSV structure: {message}"}), 400
            
            # Extract university name from the uni_name column
            university_name = df['uni_name'].iloc[1] if not df.empty else "Unknown University"
            university_name = str(university_name).strip()
            
            # Check if university already exists
            if university_name in university_data:
                os.unlink(temp_file.name)  # Clean up temp file
                return jsonify({"error": f"University '{university_name}' already exists. Please delete the existing one first if you want to replace it."}), 400
            
            # Store university data using the actual university name from CSV
            university_data[university_name] = {
                'name': university_name,
                'data': df
            }
            
            # Clean up temp file
            os.unlink(temp_file.name)
            
            logger.info(f"Successfully uploaded university: {university_name}")
            return jsonify({
                "message": f"University '{university_name}' uploaded successfully",
                "university": {
                    "name": university_name,
                    "document_count": len(df)
                }
            })
            
    except Exception as e:
        logger.error(f"Error uploading university: {e}")
        return jsonify({"error": f"Error processing file: {str(e)}"}), 500

@app.route('/api/universities/<university_name>', methods=['DELETE'])
def delete_university(university_name):
    """Delete a university database"""
    if university_name not in university_data:
        return jsonify({"error": "University not found"}), 404
    
    try:
        # Remove from ChromaDB
        collection_name = f"uni_{secure_filename(university_name).replace(' ', '_').lower()}"
        try:
            chroma_client.delete_collection(name=collection_name)
            logger.info(f"Deleted ChromaDB collection for {university_name}")
        except Exception as e:
            logger.warning(f"Could not delete ChromaDB collection for {university_name}: {e}")
        
        # Remove from memory
        del university_data[university_name]
        if university_name in loaded_universities:
            del loaded_universities[university_name]
        
        logger.info(f"Successfully deleted university: {university_name}")
        return jsonify({"message": f"University '{university_name}' deleted successfully"})
        
    except Exception as e:
        logger.error(f"Error deleting university {university_name}: {e}")
        return jsonify({"error": f"Error deleting university: {str(e)}"}), 500

@app.route('/ask', methods=['POST'])
def ask_chatbot():
    user_query = request.json.get('query')
    custom_prompt = request.json.get('custom_prompt')
    api_key = request.json.get('api_key')
    university_name = request.json.get('university_name')
    
    if not user_query:
        return jsonify({"answer": "Please provide a query."}), 400
    
    if not api_key:
        return jsonify({"answer": "Please provide your Google API key in the settings."}), 400
    
    if not university_name:
        return jsonify({"answer": "Please select a university from the dropdown before asking questions."}), 400
    
    if university_name not in university_data:
        return jsonify({"answer": "The selected university is no longer available. Please select a different university."}), 400

    try:
        # Initialize client with user's API key
        client = genai.Client(api_key=api_key)
        
        # Get or create collection for selected university
        db = get_or_create_collection(api_key, university_name)
        
        # Create embedding function for query
        embed_fn = GeminiEmbeddingFunction(api_key=api_key)
        embed_fn.document_mode = False

        # Search the Chroma DB using the specified query.
        try:
            result = db.query(query_texts=[user_query], n_results=10) # Retrieve top 5 passages
            retrieved_documents = result["documents"][0] if result["documents"] else []
            retrieved_metadatas = result["metadatas"][0] if result["metadatas"] else []
        except Exception as e:
            logger.error(f"ChromaDB query error: {e}")
            retrieved_documents = []  # Continue without retrieved passages
            retrieved_metadatas = []

        # Construct the prompt for Gemini
        query_oneline = user_query.replace("\n", " ")

        # Use custom prompt if provided, otherwise use default
        if custom_prompt:
            base_prompt = custom_prompt.strip()
        else:
            base_prompt = f"""You are a helpful and informative bot that answers questions from undergraduate students asking about career services at {university_name} using text from the reference passage included below.
                            Be sure to respond in a complete sentence, being comprehensive, including all relevant background information. Be sure to break down complicated concepts and
                            strike a friendly and conversational tone. Give additional advice on top of the given text on how the student can maximize the value of the resource. If the passage is irrelevant to the answer, you may ignore it.

                            **Please format your response using Markdown, including bullet points, bold text, and proper spacing where appropriate.**"""

        prompt = f"""University: {university_name}. If anyone asks the university name or what university this is for answer with that.
        {base_prompt}

        QUESTION: {query_oneline}
        """
        
        # Add retrieved passages with their URLs to the prompt
        sources = []
        for i, (passage, metadata) in enumerate(zip(retrieved_documents, retrieved_metadatas)):
            passage_oneline = passage.replace("\n", " ")
            prompt += f"PASSAGE {i+1}: {passage_oneline}\n"
            
            # Collect source URLs for reference
            if metadata and metadata.get('rec_url'):
                url = metadata['rec_url']
                if url and url.strip() and url.lower() not in ['nan', 'none', '']:
                    sources.append(url)
        
        try:
            gemini_answer = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt
            )
            answer_text = gemini_answer.text
            
            # Append sources if available
            if sources:
                unique_sources = list(dict.fromkeys(sources))  # Remove duplicates while preserving order
                
                # Format sources as HTML links that open in new tabs
                formatted_links = []
                for url in unique_sources:
                    # Create a display text from the URL (use domain or full URL)
                    try:
                        from urllib.parse import urlparse
                        parsed = urlparse(url)
                        display_text = parsed.netloc if parsed.netloc else url
                    except:
                        display_text = url
                    
                    # Create HTML link with styling
                    link_html = f'<a href="{url}" target="_blank" rel="noopener noreferrer" style="color: #007bff; text-decoration: underline; transition: color 0.3s ease;" onmouseover="this.style.color=\'#0056b3\'" onmouseout="this.style.color=\'#007bff\'" title="Click to open in new tab">{display_text}...</a>'
                    formatted_links.append(link_html)
                
                answer_text += f"\n\n**Sources:**\n\n{("\n\n").join(formatted_links)}"
                
        except Exception as e:
            logger.error(f"Gemini API Error: {e}")
            # More specific error messages
            error_str = str(e).lower()
            if "api key" in error_str or "authentication" in error_str:
                answer_text = "Invalid API key. Please check your Google API key in the settings."
            elif "quota" in error_str or "limit" in error_str:
                answer_text = "API quota exceeded. Please try again later or check your API key limits."
            else:
                answer_text = "Sorry, there was an issue generating the response. Please try again."

    except Exception as e:
        logger.error(f"General API Error: {e}")
        # Handle various error types
        error_str = str(e).lower()
        if "api key" in error_str or "authentication" in error_str or "invalid" in error_str:
            answer_text = "Invalid API key. Please check your Google API key in the settings."
        elif "database" in error_str:
            answer_text = "Database temporarily unavailable. Please try again."
        else:
            answer_text = "Sorry, an error occurred. Please try again."

    return jsonify({"answer": answer_text})

# Preload CSV files from data directory when module is imported
logger.info("Preloading CSV files from data directory...")
preload_csv_files()

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=False)