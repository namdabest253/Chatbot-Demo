// static/script.js
document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const chatbox = document.getElementById('chatbox');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const toggleIndicator = document.getElementById('toggle-indicator');
    
    // API Key elements
    const apiKeyInput = document.getElementById('api-key-input');
    const toggleApiKeyVisibility = document.getElementById('toggle-api-key-visibility');
    const eyeOpen = document.getElementById('eye-open');
    const eyeClosed = document.getElementById('eye-closed');
    const apiKeyStatus = document.getElementById('api-key-status');
    const apiKeySaved = document.getElementById('api-key-saved');
    const apiKeyMissing = document.getElementById('api-key-missing');
    
    // University dropdown elements
    const universityDropdownBtn = document.getElementById('university-dropdown-btn');
    const universityDropdownMenu = document.getElementById('university-dropdown-menu');
    const selectedUniversity = document.getElementById('selected-university');
    const universitySearch = document.getElementById('university-search');
    const universityList = document.getElementById('university-list');
    
    // University management elements
    const manageUniversitiesBtn = document.getElementById('manage-universities-btn');
    const universityModal = document.getElementById('university-modal');
    const universityModalClose = document.getElementById('university-modal-close');
    const universityModalCloseBtn = document.getElementById('university-modal-close-btn');
    const universityFileInput = document.getElementById('university-file-input');
    const uploadStatus = document.getElementById('upload-status');
    const uploadProgress = document.getElementById('upload-progress');
    const uploadProgressBar = document.getElementById('upload-progress-bar');
    const uploadMessage = document.getElementById('upload-message');
    const universitiesList = document.getElementById('universities-list');
    
    // Selection modal elements
    const universitySelectionModal = document.getElementById('university-selection-modal');
    const selectionUploadBtn = document.getElementById('selection-upload-btn');
    const selectionCloseBtn = document.getElementById('selection-close-btn');
    
    // Prompt editing elements
    const changePromptBtn = document.getElementById('change-prompt-btn');
    const promptModal = document.getElementById('prompt-modal');
    const promptModalClose = document.getElementById('prompt-modal-close');
    const promptTextarea = document.getElementById('prompt-textarea');
    const promptCancelBtn = document.getElementById('prompt-cancel-btn');
    const promptSaveBtn = document.getElementById('prompt-save-btn');
    
    // Default prompt
    const DEFAULT_PROMPT = `You are a helpful and informative bot that answers questions from undergraduate students asking about career services and using text from the reference passage included below.
Be sure to respond in a complete sentence, being comprehensive, including all relevant background information. Be sure to break down complicated concepts and
strike a friendly and conversational tone. Give additional advice on top of the given text on how the student can maximize the value of the resource. If the passage is irrelevant to the answer, you may ignore it.

**Please format your response using Markdown, including bullet points, bold text, and proper spacing where appropriate.**`;

    // Global state
    let availableUniversities = [];
    let selectedUniversityName = null;
    let filteredUniversities = [];

    // Initialize dark mode
    initializeDarkMode();
    
    // Initialize prompt
    initializePrompt();
    
    // Initialize API key
    initializeApiKey();
    
    // Initialize universities
    initializeUniversities();

    // Auto-resize textarea
    setupTextareaAutoResize();

    // Settings panel toggle
    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsPanel.classList.toggle('hidden');
    });

    // Close settings panel when clicking outside
    document.addEventListener('click', (e) => {
        if (!settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
            settingsPanel.classList.add('hidden');
        }
    });

    // Dark mode toggle
    darkModeToggle.addEventListener('click', () => {
        toggleDarkMode();
    });

    // Prompt editing event listeners
    changePromptBtn.addEventListener('click', () => {
        openPromptModal();
    });

    promptModalClose.addEventListener('click', () => {
        closePromptModal();
    });

    promptCancelBtn.addEventListener('click', () => {
        closePromptModal();
    });

    promptSaveBtn.addEventListener('click', () => {
        savePrompt();
    });

    // Close modal when clicking outside
    promptModal.addEventListener('click', (e) => {
        if (e.target === promptModal) {
            closePromptModal();
        }
    });

    // API Key event listeners
    apiKeyInput.addEventListener('input', () => {
        saveApiKey();
        updateApiKeyStatus();
    });

    toggleApiKeyVisibility.addEventListener('click', () => {
        toggleApiKeyVisibilityState();
    });

    // University dropdown event listeners
    universityDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        universityDropdownMenu.classList.toggle('hidden');
        if (!universityDropdownMenu.classList.contains('hidden')) {
            universitySearch.focus();
        }
    });

    universitySearch.addEventListener('input', () => {
        filterUniversities();
    });

    // University management event listeners
    manageUniversitiesBtn.addEventListener('click', () => {
        openUniversityModal();
    });

    universityModalClose.addEventListener('click', () => {
        closeUniversityModal();
    });

    universityModalCloseBtn.addEventListener('click', () => {
        closeUniversityModal();
    });

    universityFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            uploadUniversityFile(e.target.files[0]);
        }
    });

    // Close university dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!universityDropdownBtn.contains(e.target) && !universityDropdownMenu.contains(e.target)) {
            universityDropdownMenu.classList.add('hidden');
        }
    });

    // Close university modal when clicking outside
    universityModal.addEventListener('click', (e) => {
        if (e.target === universityModal) {
            closeUniversityModal();
        }
    });



    // Selection modal event listeners
    selectionUploadBtn.addEventListener('click', () => {
        universitySelectionModal.classList.add('hidden');
        openUniversityModal();
    });

    selectionCloseBtn.addEventListener('click', () => {
        universitySelectionModal.classList.add('hidden');
    });

    // Form submission
    chatForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const query = userInput.value.trim();
        if (query === '') {
            return;
        }

        // Disable input and button
        setInputState(false);

        // Display user's message
        appendUserMessage(query);
        userInput.value = '';
        resetTextareaHeight();

        // Display typing indicator
        const typingIndicator = appendTypingIndicator();

        try {
            // Send query to Flask backend with custom prompt, API key, and selected university
            const customPrompt = getCurrentPrompt();
            const apiKey = getCurrentApiKey();
            
            if (!apiKey) {
                throw new Error('Please enter your Google API key in the settings.');
            }
            
            if (!selectedUniversityName) {
                showUniversitySelectionModal();
                throw new Error('Please select a university from the dropdown.');
            }
            
            const response = await fetch('/ask', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    query: query,
                    custom_prompt: customPrompt,
                    api_key: apiKey,
                    university_name: selectedUniversityName
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            // Remove typing indicator
            removeTypingIndicator(typingIndicator);

            // Display bot's answer with typing animation
            await appendBotMessageWithTyping(data.answer);

        } catch (error) {
            console.error('Error fetching chatbot response:', error);
            removeTypingIndicator(typingIndicator);
            await appendBotMessageWithTyping('Oops! Something went wrong. Please try again.');
        } finally {
            // Re-enable input and button
            setInputState(true);
            userInput.focus();
        }
    });

    // Initialize functions
    function initializeDarkMode() {
        const isDarkMode = localStorage.getItem('darkMode') === 'true' || 
                          (!localStorage.getItem('darkMode') && window.matchMedia('(prefers-color-scheme: dark)').matches);
        
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        updateDarkModeToggle();
    }

    function toggleDarkMode() {
        const isDarkMode = document.documentElement.classList.contains('dark');
        
        if (isDarkMode) {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('darkMode', 'false');
        } else {
            document.documentElement.classList.add('dark');
            localStorage.setItem('darkMode', 'true');
        }
        
        updateDarkModeToggle();
    }

    function updateDarkModeToggle() {
        const isDarkMode = document.documentElement.classList.contains('dark');
        if (isDarkMode) {
            darkModeToggle.classList.add('bg-blue-600');
            darkModeToggle.classList.remove('bg-gray-300');
            toggleIndicator.classList.add('translate-x-6');
            toggleIndicator.classList.remove('translate-x-1');
        } else {
            darkModeToggle.classList.remove('bg-blue-600');
            darkModeToggle.classList.add('bg-gray-300');
            toggleIndicator.classList.remove('translate-x-6');
            toggleIndicator.classList.add('translate-x-1');
        }
    }

    function setupTextareaAutoResize() {
        userInput.addEventListener('input', () => {
            // Reset height to calculate new height
            userInput.style.height = 'auto';
            // Set new height based on scroll height, max 120px (roughly 5 lines)
            const newHeight = Math.min(userInput.scrollHeight, 120);
            userInput.style.height = newHeight + 'px';
        });

        // Handle enter key
        userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                chatForm.dispatchEvent(new Event('submit'));
            }
        });
    }

    function resetTextareaHeight() {
        userInput.style.height = 'auto';
    }

    function setInputState(enabled) {
        userInput.disabled = !enabled;
        
        if (enabled) {
            userInput.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
            userInput.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }

    function appendUserMessage(text) {
        const messageContainer = document.createElement('div');
        messageContainer.className = 'max-w-4xl mx-auto animate-slide-up';
        
        messageContainer.innerHTML = `
            <div class="flex justify-end mb-6">
                <div class="max-w-xs lg:max-w-md xl:max-w-lg">
                    <div class="bg-blue-600 text-white px-6 py-3 rounded-3xl rounded-br-lg shadow-lg">
                        <p class="text-sm whitespace-pre-wrap">${escapeHtml(text)}</p>
                    </div>
                </div>
            </div>
        `;
        
        chatbox.appendChild(messageContainer);
        scrollToBottom();
    }

    async function appendBotMessageWithTyping(text) {
        // Convert markdown to HTML first
        const htmlContent = marked.parse(text);
        
        // Create message container
        const messageContainer = document.createElement('div');
        messageContainer.className = 'max-w-4xl mx-auto animate-slide-up';
        
        // Create the message structure
        messageContainer.innerHTML = `
            <div class="text-left mb-8">
                <div class="text-gray-800 dark:text-gray-200 prose dark:prose-invert max-w-none">
                    <div id="typing-content"></div>
                </div>
            </div>
        `;
        
        chatbox.appendChild(messageContainer);
        scrollToBottom();
        
        const typingContent = messageContainer.querySelector('#typing-content');
        
        // Parse HTML content and extract text for typing animation
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        
        await typeHTMLContent(typingContent, tempDiv);
    }

    async function typeHTMLContent(container, sourceElement) {
        const childNodes = Array.from(sourceElement.childNodes);
        
        for (const node of childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent;
                if (text.trim()) {
                    await typeText(container, text);
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                // Create the element
                const newElement = document.createElement(node.tagName.toLowerCase());
                
                // Copy attributes
                for (const attr of node.attributes || []) {
                    newElement.setAttribute(attr.name, attr.value);
                }
                
                container.appendChild(newElement);
                
                // Recursively type content of this element
                await typeHTMLContent(newElement, node);
            }
        }
    }

    async function typeText(container, text) {
        // Split by spaces but preserve the spaces
        const parts = text.split(/(\s+)/);
        
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            
            // Skip empty parts
            if (!part) continue;
            
            // Create a span for each part (word or space) with animation
            const partSpan = document.createElement('span');
            partSpan.textContent = part;
            partSpan.style.opacity = '0';
            partSpan.style.transform = 'translateY(5px)';
            partSpan.style.display = 'inline';
            partSpan.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            
            container.appendChild(partSpan);
            
            // Trigger animation
            setTimeout(() => {
                partSpan.style.opacity = '1';
                partSpan.style.transform = 'translateY(0)';
            }, 10);
            
            // Scroll to bottom as we type
            scrollToBottom();
            
            // Only delay for actual words, not whitespace
            if (part.trim()) {
                const baseDelay = 10;
                const randomDelay = Math.random() * 30;
                await new Promise(resolve => setTimeout(resolve, baseDelay + randomDelay));
            }
        }
    }

    function appendTypingIndicator() {
        const typingContainer = document.createElement('div');
        typingContainer.className = 'max-w-4xl mx-auto animate-fade-in';
        typingContainer.id = 'typing-indicator';
        
        typingContainer.innerHTML = `
            <div class="text-left mb-8">
                <div class="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
                    <div class="flex space-x-1">
                        <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
                        <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
                        <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
                    </div>
                    <span class="text-sm">Thinking...</span>
                </div>
            </div>
        `;
        
        chatbox.appendChild(typingContainer);
        scrollToBottom();
        return typingContainer;
    }

    function removeTypingIndicator(indicator) {
        if (indicator && indicator.parentNode) {
            indicator.parentNode.removeChild(indicator);
        }
    }

    function scrollToBottom() {
        setTimeout(() => {
            chatbox.scrollTop = chatbox.scrollHeight;
        }, 50);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Prompt management functions
    function initializePrompt() {
        const savedPrompt = localStorage.getItem('customPrompt');
        if (!savedPrompt) {
            localStorage.setItem('customPrompt', DEFAULT_PROMPT);
        }
    }

    function getCurrentPrompt() {
        return localStorage.getItem('customPrompt') || DEFAULT_PROMPT;
    }

    function openPromptModal() {
        const currentPrompt = getCurrentPrompt();
        promptTextarea.value = currentPrompt;
        promptModal.classList.remove('hidden');
        settingsPanel.classList.add('hidden');
        
        // Focus on textarea
        setTimeout(() => {
            promptTextarea.focus();
        }, 100);
    }

    function closePromptModal() {
        promptModal.classList.add('hidden');
    }

    function savePrompt() {
        const newPrompt = promptTextarea.value.trim();
        if (newPrompt) {
            localStorage.setItem('customPrompt', newPrompt);
            closePromptModal();
            
            // Show a brief confirmation (optional)
            console.log('Prompt saved successfully');
        }
    }

    // API Key management functions
    function initializeApiKey() {
        const savedApiKey = localStorage.getItem('googleApiKey');
        if (savedApiKey) {
            apiKeyInput.value = savedApiKey;
        }
        updateApiKeyStatus();
    }

    function getCurrentApiKey() {
        return localStorage.getItem('googleApiKey') || '';
    }

    function saveApiKey() {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            localStorage.setItem('googleApiKey', apiKey);
        } else {
            localStorage.removeItem('googleApiKey');
        }
    }

    function updateApiKeyStatus() {
        const apiKey = getCurrentApiKey();
        
        // Hide all status indicators first
        apiKeySaved.classList.add('hidden');
        apiKeyMissing.classList.add('hidden');
        
        if (apiKey) {
            apiKeyStatus.classList.remove('hidden');
            apiKeySaved.classList.remove('hidden');
        } else {
            apiKeyStatus.classList.remove('hidden');
            apiKeyMissing.classList.remove('hidden');
        }
    }

    function toggleApiKeyVisibilityState() {
        const isPassword = apiKeyInput.type === 'password';
        
        if (isPassword) {
            apiKeyInput.type = 'text';
            eyeOpen.classList.remove('hidden');
            eyeClosed.classList.add('hidden');
        } else {
            apiKeyInput.type = 'password';
            eyeOpen.classList.add('hidden');
            eyeClosed.classList.remove('hidden');
        }
    }

    // University management functions
    async function initializeUniversities() {
        try {
            // Try to load from local storage first
            const savedUniversities = loadUniversitiesFromLocalStorage();
            if (savedUniversities && savedUniversities.length > 0) {
                availableUniversities = savedUniversities;
                filteredUniversities = [...availableUniversities];
                updateUniversityDropdown();
                updateUniversitiesList();
                console.log(`Loaded ${availableUniversities.length} universities from local storage`);
            }
            
            // Always sync with server to get any new data
            await loadUniversities();
            
            if (availableUniversities.length > 0) {
                // Don't auto-select - let user choose
                selectedUniversityName = null;
                updateSelectedUniversity();
            } else {
                // Show selection modal if no universities available
                showUniversitySelectionModal();
            }
        } catch (error) {
            console.error('Error loading universities:', error);
            selectedUniversity.textContent = 'Error loading universities';
        }
    }

    function saveUniversitiesToLocalStorage() {
        try {
            localStorage.setItem('universitiesData', JSON.stringify(availableUniversities));
            console.log('Universities saved to local storage');
        } catch (error) {
            console.error('Error saving universities to local storage:', error);
        }
    }

    function loadUniversitiesFromLocalStorage() {
        try {
            const savedData = localStorage.getItem('universitiesData');
            if (savedData) {
                return JSON.parse(savedData);
            }
        } catch (error) {
            console.error('Error loading universities from local storage:', error);
        }
        return null;
    }

    function removeUniversityFromLocalStorage(universityName) {
        try {
            const savedUniversities = loadUniversitiesFromLocalStorage();
            if (savedUniversities) {
                const updatedUniversities = savedUniversities.filter(
                    uni => uni.name !== universityName
                );
                localStorage.setItem('universitiesData', JSON.stringify(updatedUniversities));
                console.log(`Removed ${universityName} from local storage`);
            }
        } catch (error) {
            console.error('Error removing university from local storage:', error);
        }
    }

    async function loadUniversities() {
        try {
            const response = await fetch('/api/universities');
            if (!response.ok) {
                throw new Error('Failed to load universities');
            }
            const data = await response.json();
            const serverUniversities = data.universities || [];
            
            // Merge server data with local storage, prioritizing server data
            const mergedUniversities = [...serverUniversities];
            
            // Add any universities from local storage that aren't on server
            const savedUniversities = loadUniversitiesFromLocalStorage();
            if (savedUniversities) {
                savedUniversities.forEach(savedUni => {
                    if (!serverUniversities.find(serverUni => serverUni.name === savedUni.name)) {
                        mergedUniversities.push(savedUni);
                    }
                });
            }
            
            availableUniversities = mergedUniversities;
            filteredUniversities = [...availableUniversities];
            
            // Save merged data to local storage
            saveUniversitiesToLocalStorage();
            
            updateUniversityDropdown();
            updateUniversitiesList();
        } catch (error) {
            console.error('Error loading universities:', error);
            // If server fails, try to use local storage
            const savedUniversities = loadUniversitiesFromLocalStorage();
            if (savedUniversities) {
                availableUniversities = savedUniversities;
                filteredUniversities = [...availableUniversities];
                updateUniversityDropdown();
                updateUniversitiesList();
                console.log('Using local storage due to server error');
            }
            throw error;
        }
    }

    function updateSelectedUniversity() {
        if (selectedUniversityName) {
            selectedUniversity.textContent = selectedUniversityName;
        } else {
            selectedUniversity.textContent = 'Select University';
            // Show selection modal if trying to chat without university selected
        }
    }

    function updateUniversityDropdown() {
        universityList.innerHTML = '';
        
        filteredUniversities.forEach(university => {
            const item = document.createElement('div');
            item.className = 'px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-100 dark:border-gray-600 last:border-b-0';
            item.innerHTML = `
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm font-medium text-gray-900 dark:text-white">${escapeHtml(university.name)}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">${university.document_count} documents</p>
                    </div>
                </div>
            `;
            
            item.addEventListener('click', () => {
                selectedUniversityName = university.name;
                updateSelectedUniversity();
                universityDropdownMenu.classList.add('hidden');
                universitySearch.value = '';
                filterUniversities();
            });
            
            universityList.appendChild(item);
        });
        
        if (filteredUniversities.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center';
            noResults.textContent = 'No universities found';
            universityList.appendChild(noResults);
        }
    }

    function filterUniversities() {
        const searchTerm = universitySearch.value.toLowerCase();
        filteredUniversities = availableUniversities.filter(university =>
            university.name.toLowerCase().includes(searchTerm)
        );
        updateUniversityDropdown();
    }

    function openUniversityModal() {
        universityModal.classList.remove('hidden');
        settingsPanel.classList.add('hidden');
        loadUniversities(); // Refresh the list
        resetUploadStatus();
    }

    function closeUniversityModal() {
        universityModal.classList.add('hidden');
        resetUploadStatus();
    }

    function resetUploadStatus() {
        uploadStatus.classList.add('hidden');
        uploadProgress.classList.add('hidden');
        uploadProgressBar.style.width = '0%';
        uploadMessage.textContent = '';
        universityFileInput.value = '';
    }

    async function uploadUniversityFile(file) {
        if (!file) return;
        
        // Check if university already exists before uploading
        const fileName = file.name.toLowerCase();
        const existingUniversity = availableUniversities.find(uni => 
            fileName.includes(uni.name.toLowerCase()) || 
            uni.name.toLowerCase().includes(fileName.replace('.csv', '').replace(/[^a-z\s]/g, ''))
        );
        
        if (existingUniversity) {
            uploadStatus.classList.remove('hidden');
            uploadMessage.textContent = `A university with similar name "${existingUniversity.name}" already exists. Please delete it first if you want to replace it.`;
            uploadMessage.className = 'text-sm mt-2 text-red-600 dark:text-red-400';
            return;
        }
        
        // Show upload status
        uploadStatus.classList.remove('hidden');
        uploadProgress.classList.remove('hidden');
        uploadProgressBar.style.width = '10%';
        uploadMessage.textContent = 'Uploading file...';
        uploadMessage.className = 'text-sm mt-2 text-blue-600 dark:text-blue-400';

        const formData = new FormData();
        formData.append('file', file);

        try {
            // Simulate progress
            uploadProgressBar.style.width = '50%';
            
            const response = await fetch('/api/universities/upload', {
                method: 'POST',
                body: formData
            });

            uploadProgressBar.style.width = '90%';
            
            const result = await response.json();
            
            uploadProgressBar.style.width = '100%';
            
            if (response.ok) {
                uploadMessage.textContent = result.message;
                uploadMessage.className = 'text-sm mt-2 text-green-600 dark:text-green-400';
                
                // Reload universities and update dropdown
                await loadUniversities();
                
                // Auto-select the new university
                if (result.university) {
                    selectedUniversityName = result.university.name;
                    updateSelectedUniversity();
                }
                
                // Hide progress after success
                setTimeout(() => {
                    uploadProgress.classList.add('hidden');
                }, 2000);
                
            } else {
                uploadMessage.textContent = result.error || 'Upload failed';
                uploadMessage.className = 'text-sm mt-2 text-red-600 dark:text-red-400';
                uploadProgress.classList.add('hidden');
            }
        } catch (error) {
            console.error('Upload error:', error);
            uploadMessage.textContent = 'Error uploading file. Please try again.';
            uploadMessage.className = 'text-sm mt-2 text-red-600 dark:text-red-400';
            uploadProgress.classList.add('hidden');
        }
    }

    function updateUniversitiesList() {
        universitiesList.innerHTML = '';
        
        availableUniversities.forEach(university => {
            const item = document.createElement('div');
            item.className = 'flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600';
            
            item.innerHTML = `
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <h4 class="text-sm font-medium text-gray-900 dark:text-white">${escapeHtml(university.name)}</h4>
                    </div>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">${university.document_count} documents</p>
                </div>
                <div class="flex gap-2">
                    <button class="delete-university-btn px-3 py-1 text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 border border-red-300 dark:border-red-600 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors duration-200" data-university="${escapeHtml(university.name)}">
                        Delete
                    </button>
                </div>
            `;
            
            const deleteBtn = item.querySelector('.delete-university-btn');
            
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    deleteUniversity(university.name);
                });
            }
            
            universitiesList.appendChild(item);
        });
        
        if (availableUniversities.length === 0) {
            const noUniversities = document.createElement('div');
            noUniversities.className = 'text-center py-8 text-gray-500 dark:text-gray-400';
            noUniversities.textContent = 'No universities available';
            universitiesList.appendChild(noUniversities);
        }
    }

    async function deleteUniversity(universityName) {
        if (!confirm(`Are you sure you want to delete "${universityName}"? This action cannot be undone.`)) {
            return;
        }
        
        try {
            const response = await fetch(`/api/universities/${encodeURIComponent(universityName)}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (response.ok) {
                // Remove from local storage first
                removeUniversityFromLocalStorage(universityName);
                
                // Reload universities
                await loadUniversities();
                
                // If deleted university was selected, clear selection
                if (selectedUniversityName === universityName) {
                    selectedUniversityName = null;
                    updateSelectedUniversity();
                    
                    // Show selection modal if no universities left
                    if (availableUniversities.length === 0) {
                        showUniversitySelectionModal();
                    }
                }
                
                console.log(result.message);
            } else {
                alert(result.error || 'Failed to delete university');
            }
        } catch (error) {
            console.error('Error deleting university:', error);
            // Even if server delete fails, remove from local storage
            removeUniversityFromLocalStorage(universityName);
            
            // Update local display
            availableUniversities = availableUniversities.filter(uni => uni.name !== universityName);
            filteredUniversities = [...availableUniversities];
            updateUniversityDropdown();
            updateUniversitiesList();
            
            alert('University removed from local storage. Server deletion may have failed.');
        }
    }



    // University selection modal functions
    function showUniversitySelectionModal() {
        universitySelectionModal.classList.remove('hidden');
    }
});