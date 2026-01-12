/**
 * Login UI Controller
 * Manages visual feedback and user interactions for the login form
 * Aligned with Apple HIG principles: immediate feedback, clear state communication
 */

(function() {
    'use strict';
    
    // DOM Elements
    const form = document.getElementById('loginForm');
    const submitButton = document.getElementById('btn-submit');
    const messageContainer = document.getElementById('message');
    
    if (!form || !submitButton || !messageContainer) {
        console.error('Login UI Controller: Required DOM elements not found');
        return;
    }
    
    // Event listener removed to avoid conflict with login.js
    // UI state should be controlled by the main logic module
    /*
    form.addEventListener('submit', (event) => {
        setLoadingState(true);
        clearMessage();
    });
    */
    
    /**
     * Set loading state on submit button
     * @param {boolean} isLoading - Whether the form is currently submitting
     */
    function setLoadingState(isLoading) {
        if (isLoading) {
            submitButton.classList.add('loading');
            submitButton.setAttribute('aria-busy', 'true');
            submitButton.disabled = true;
        } else {
            submitButton.classList.remove('loading');
            submitButton.setAttribute('aria-busy', 'false');
            submitButton.disabled = false;
        }
    }
    
    /**
     * Display message to user
     * @param {string} text - Message content
     * @param {string} type - Message type ('error' or 'success')
     */
    function showMessage(text, type = 'error') {
        messageContainer.textContent = text;
        messageContainer.classList.add('visible');
        messageContainer.setAttribute('role', 'alert');
        setLoadingState(false);
    }
    
    /**
     * Clear displayed message
     */
    function clearMessage() {
        messageContainer.textContent = '';
        messageContainer.classList.remove('visible');
    }
    
    /**
     * Monitor message container for changes
     * Automatically reset loading state when error appears
     */
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList' || mutation.type === 'characterData') {
                const hasContent = messageContainer.innerText.trim().length > 0;
                
                if (hasContent) {
                    messageContainer.classList.add('visible');
                    setLoadingState(false);
                } else {
                    messageContainer.classList.remove('visible');
                }
            }
        });
    });
    
    observer.observe(messageContainer, {
        childList: true,
        characterData: true,
        subtree: true
    });
    
    // Expose utilities globally for login.js module to use
    window.LoginUI = {
        setLoadingState,
        showMessage,
        clearMessage
    };
})();
