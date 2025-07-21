# app.py
from flask import Flask, request, render_template, jsonify
from google import genai
from google.genai import types
from google.api_core import retry
import pandas as pd
import chromadb
import os

app = Flask(__name__)

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

# IMPORTANT: Data loading should happen once when the app starts, not on every request.
try:
    df = pd.read_csv('data/Loyola Site Map Data Table Formatted - Sheet1.csv', names = ['rec_id','uni_id', 'uni_name', 'dept_id', 'dept_name','description','rec_url','date_created','date_modified', 'user_rating', 'tags', 'rec_content'])
    print("Uploaded Data")
except FileNotFoundError:
    print("Warning: CSV file not found. Please adjust path if running locally.")
    # Create a dummy DataFrame for local testing if file is missing
    df = pd.DataFrame({
        'rec_id': [1, 2], 'uni_id': [1, 1], 'uni_name': ['Wesleyan', 'Wesleyan'],
        'dept_id': ['0', '0'], 'dept_name': ['General', 'General'],
        'description': ['Desc 1', 'Desc 2'], 'rec_url': ['url1', 'url2'],
        'date_created': ['today', 'today'], 'date_modified': ['today', 'today'],
        'user_rating': [5, 5], 'tags': ['tag1', 'tag2'],
        'rec_content': [
            "Welcome to the healthcare resources page for undergraduates! Explore our pre-med advising, internships, and research opportunities. We have partnerships with local hospitals and clinics.",
            "Career services offers resume reviews, interview prep, and career fairs for all students. Schedule an appointment with a career counselor to discuss your interests, including those in healthcare."
        ]
    })


student_university_id = 1
student_department_id = '0'
documents = df.loc[df['dept_id'] == student_department_id, 'rec_content'].tolist()

# --- Initialize ChromaDB (without embeddings initially) ---
DB_NAME = "googlecardb"
chroma_client = chromadb.Client()

# We'll initialize the collection per-request with user's API key
def get_or_create_collection(api_key):
    """Get or create ChromaDB collection with user's API key"""
    embed_fn = GeminiEmbeddingFunction(api_key=api_key)
    embed_fn.document_mode = True
    
    # Try to get existing collection or create new one
    try:
        db = chroma_client.get_collection(name=DB_NAME)
        # Update the embedding function
        db._embedding_function = embed_fn
    except:
        # Create new collection
        db = chroma_client.create_collection(name=DB_NAME, embedding_function=embed_fn)
    
    # Add documents only if the collection is empty (to avoid duplicates)
    if db.count() == 0:
        print("Adding documents to ChromaDB...")
        db.add(documents=documents, ids=[str(i) for i in range(len(documents))])
    else:
        print("ChromaDB already contains documents.")
    
    return db

# --- Flask Routes ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/ask', methods=['POST'])
def ask_chatbot():
    user_query = request.json.get('query')
    custom_prompt = request.json.get('custom_prompt')
    api_key = request.json.get('api_key')
    
    if not user_query:
        return jsonify({"answer": "Please provide a query."}), 400
    
    if not api_key:
        return jsonify({"answer": "Please provide your Google API key in the settings."}), 400

    try:
        # Initialize client with user's API key
        client = genai.Client(api_key=api_key)
        
        # Get or create collection with user's API key
        db = get_or_create_collection(api_key)
        
        # Create embedding function for query
        embed_fn = GeminiEmbeddingFunction(api_key=api_key)
        embed_fn.document_mode = False

        # Search the Chroma DB using the specified query.
        result = db.query(query_texts=[user_query], n_results=5) # Retrieve top 5 passages
        retrieved_passages = result["documents"][0] if result["documents"] else []

        # Construct the prompt for Gemini
        query_oneline = user_query.replace("\n", " ")

        # Use custom prompt if provided, otherwise use default
        if custom_prompt:
            base_prompt = custom_prompt.strip()
        else:
            base_prompt = """You are a helpful and informative bot that answers questions from undergraduate students asking about career services and using text from the reference passage included below.
Be sure to respond in a complete sentence, being comprehensive, including all relevant background information. Be sure to break down complicated concepts and
strike a friendly and conversational tone. Give additional advice on top of the given text on how the student can maximize the value of the resource. If the passage is irrelevant to the answer, you may ignore it.

**Please format your response using Markdown, including bullet points, bold text, and proper spacing where appropriate.**"""

        prompt = f"""{base_prompt}

QUESTION: {query_oneline}
"""
        
        # Add *only* the retrieved passages to the prompt
        for passage in retrieved_passages: # Use retrieved_passages here, not 'documents'
            passage_oneline = passage.replace("\n", " ")
            prompt += f"PASSAGE: {passage_oneline}\n"

        try:
            gemini_answer = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt
            )
            answer_text = gemini_answer.text
        except Exception as e:
            answer_text = f"Sorry, an error occurred while generating the response: {e}"
            print(f"Gemini API Error: {e}")

    except Exception as e:
        if "API_KEY_INVALID" in str(e) or "invalid API key" in str(e).lower():
            answer_text = "Invalid API key. Please check your Google API key in the settings."
        else:
            answer_text = f"Sorry, an error occurred: {e}"
        print(f"API Error: {e}")

    return jsonify({"answer": answer_text})

if __name__ == '__main__':
    # app.run(debug=True, port=5000)
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)