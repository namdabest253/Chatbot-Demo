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

    // Initialize dark mode
    initializeDarkMode();
    
    // Initialize prompt
    initializePrompt();
    
    // Initialize API key
    initializeApiKey();

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
            // Send query to Flask backend with custom prompt and API key
            const customPrompt = getCurrentPrompt();
            const apiKey = getCurrentApiKey();
            
            if (!apiKey) {
                throw new Error('Please enter your Google API key in the settings.');
            }
            
            const response = await fetch('/ask', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    query: query,
                    custom_prompt: customPrompt,
                    api_key: apiKey
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
});