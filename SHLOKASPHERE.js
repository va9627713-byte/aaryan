/**
 * ===================================================================================
 * SHLOKASPHERE - A World-Class AI-Powered Chat Application
 * ===================================================================================
 * This file contains the complete, self-contained React application.
 * It is structured internally into logical sections for clarity and maintainability.
 *
 * --- File Structure ---
 * 1.  **Firebase Service Setup**: Initializes and exports Firebase auth and Firestore.
 * 2.  **API Service Setup**: Functions for calling external AI analysis APIs.
 * 3.  **Theme Management**: A React Context for persistent light/dark mode.
 * 4.  **Custom Hooks**: `useAuth` and `useMessages` encapsulate all state and side-effect logic.
 * 5.  **UI Components**: Reusable components like `MessageItem`, `Avatar`, `AnalyticsDashboard`, etc.
 * 6.  **Main App Component**: The top-level component that assembles the entire application.
 *
 */
import React, { useState, useEffect, useRef, useCallback, useReducer, memo, createContext, useContext } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp, updateDoc, query, orderBy, limit, getDocs, where, startAfter, doc } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

// --- Firebase Service Setup ---
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Google sign-in error:", error);
    toast.error(`Sign-in failed: ${error.message}`);
  }
}

async function signOutUser() {
  await signOut(auth);
}

function subscribeToAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

async function sendMessageToFirestore(messageObj) {
  return await addDoc(collection(db, "messages"), messageObj);
}

// --- API Service Setup ---

// Simple session cache to avoid re-analyzing the same text, improving performance and reducing API costs.
const apiCache = {
  get: (key) => {
    try {
      const item = sessionStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      return null;
    }
  },
  set: (key, value) => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // Cache is non-critical, so we can ignore storage errors (e.g., quota exceeded)
    }
  }
};

const analyzeSentiment = async (text) => {
  const cacheKey = `sentiment:${text}`;
  const cached = apiCache.get(cacheKey);
  if (cached) return cached;
  try {
    const response = await fetch(`/api/google-sentiment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error("Sentiment API error");
    const data = await response.json();
    apiCache.set(cacheKey, data);
    return data;
  } catch (err) {
    console.error("Sentiment API call failed:", err);
    return null;
  }
};

const analyzeEntities = async (text) => {
  const cacheKey = `entities:${text}`;
  const cached = apiCache.get(cacheKey);
  if (cached) return cached;
  try {
    const response = await fetch(`/api/google-entities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error("Entity API error");
    const data = await response.json();
    const entities = data.entities || [];
    apiCache.set(cacheKey, entities);
    return entities;
  } catch (err) {
    console.error("Entity API call failed:", err);
    return [];
  }
};

const translateText = async (text, target) => {
  const cacheKey = `translate:${target}:${text}`;
  const cached = apiCache.get(cacheKey);
  if (cached) return cached;
  try {
    const response = await fetch(`/api/google-translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, target }),
    });
    if (!response.ok) throw new Error("Translation API error");
    const data = await response.json();
    const translation = data.translation || "";
    apiCache.set(cacheKey, translation);
    return translation;
  } catch (err) {
    console.error("Translation API call failed:", err);
    return "";
  }
};

const getAIResponse = async (message, history, language) => {
  try {
    const response = await fetch(`/api/generate-response`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history, language }),
    });
    if (!response.ok) throw new Error("AI response API error");
    const data = await response.json();
    return data.text;
  } catch (err) {
    console.error("AI API call failed:", err);
    return "I'm sorry, I'm having trouble connecting right now.";
  }
};

/**
 * A centralized utility to perform all AI analyses on a message and update it in Firestore.
 * @param {import('firebase/firestore').DocumentReference} docRef - The Firestore document reference for the message.
 * @param {string} text - The text of the message to analyze.
 * @param {string} targetLang - The language code to translate the text into.
 * @returns {Promise<boolean>} - A promise that resolves to true on success and false on failure.
 */
async function analyzeAndSaveMessageFeatures(docRef, text, targetLang) {
  try {
    const [sentiment, entities, translation] = await Promise.all([
      analyzeSentiment(text),
      analyzeEntities(text),
      translateText(text, targetLang)
    ]);
    await updateDoc(docRef, { ...(sentiment && { sentiment }), ...(entities && { entities }), ...(translation && { translation }) });
    return true;
  } catch (e) {
    console.error("Failed to update message with analysis:", e);
    return false;
  }
}

// --- Language (i18n) Management ---
const translations = {
  en: {
    // App
    appName: "SHLOKASPHERE",
    loadingApp: "Loading Application...",
    loggedInAs: "Logged in as:",
    signOut: "Sign out",
    welcomeTitle: "Welcome to the AI-Powered Chat Experience",
    welcomeSubtitle: "Sign in to begin your conversation.",
    signInWithGoogle: "Sign in with Google",
    // Chat
    loadMore: "Load More",
    loadingMore: "Loading...",
    loadingMessages: "Loading messages...",
    messagePlaceholder: "Type your message...",
    send: "Send",
    // Analytics
    analyticsDashboard: "Analytics Dashboard",
    totalMessages: "Total Messages:",
    uniqueUsers: "Unique Users:",
    // Message Item
    translationLabel: "Translation:",
  },
  hi: {
    // App
    appName: "श्लोकस्फेयर",
    loadingApp: "एप्लिकेशन लोड हो रहा है...",
    loggedInAs: "के रूप में लॉग इन:",
    signOut: "साइन आउट",
    welcomeTitle: "एआई-संचालित चैट अनुभव में आपका स्वागत है",
    welcomeSubtitle: "अपनी बातचीत शुरू करने के लिए साइन इन करें।",
    signInWithGoogle: "Google से साइन इन करें",
    // Chat
    loadMore: "और लोड करें",
    loadingMore: "लोड हो रहा है...",
    loadingMessages: "संदेश लोड हो रहे हैं...",
    messagePlaceholder: "अपना संदेश लिखें...",
    send: "भेजें",
    // Analytics
    analyticsDashboard: "विश्लेषिकी डैशबोर्ड",
    totalMessages: "कुल संदेश:",
    uniqueUsers: "अद्वितीय उपयोगकर्ता:",
    // Message Item
    translationLabel: "अनुवाद:",
  }
};

const LanguageContext = createContext();

const useTranslation = () => {
  const { language } = useContext(LanguageContext);
  return (key) => translations[language][key] || key;
};

// --- Theme Management ---
const ThemeContext = createContext();

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'light' || savedTheme === 'dark') {
        return savedTheme;
      }
    } catch (error) {
      console.warn("localStorage is not available. Using default theme.");
    }
    return 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.lang = document.documentElement.lang; // Sync with language
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('theme', theme);
    } catch (error) {
      console.warn("localStorage is not available. Theme will not be persisted.");
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    try {
      const savedLang = localStorage.getItem('language');
      if (savedLang === 'en' || savedLang === 'hi') {
        return savedLang;
      }
    } catch (error) {
      console.warn("localStorage is not available. Using default language.");
    }
    return 'en'; // Default language
  });

  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem('language', language);
    } catch (error) {
      console.warn("localStorage is not available. Language will not be persisted.");
    }
  }, [language]);

  const value = { language, setLanguage };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

// --- Hooks ---

function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToAuth((currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return { user, loading };
}

function useMessageAnalysis() {
  const [analyzingIds, setAnalyzingIds] = useState(new Set());

  const { language } = useContext(LanguageContext);
  const langRef = useRef(language);

  useEffect(() => {
    langRef.current = language;
  }, [language]);

  const performMessageAnalysis = useCallback(async (messageId, text) => {
    if (!messageId || !text) return;
    if (messageId.startsWith('temp_')) {
      toast.error("Please wait for the message to be saved before analyzing.");
      return;
    }

    setAnalyzingIds(prev => new Set(prev).add(messageId)); // Use functional update
    toast.loading('Analyzing message...', { id: `analyzing-${messageId}` });

    try {
      const messageRef = doc(db, "messages", messageId);
      const success = await analyzeAndSaveMessageFeatures(messageRef, text, langRef.current);
      if (success) {
        toast.success('Analysis complete!', { id: `analyzing-${messageId}` });
      } else {
        toast.error('Analysis failed.', { id: `analyzing-${messageId}` });
      }
    } catch (error) {
      console.error("Failed to re-analyze message:", error);
      toast.error('Analysis failed.', { id: `analyzing-${messageId}` });
    } finally {
      setAnalyzingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(messageId);
        return newSet;
      });
    }
  }, []); // The function is now stable and doesn't depend on language state

  return { performMessageAnalysis, analyzingIds };
}

const generateId = () => `temp_${Math.random().toString(36).substr(2, 9)}`;

function moderateContent(text) {
  const bannedWords = ['badword1', 'badword2'];
  return bannedWords.some(word => text.includes(word));
}

const actionTypes = {
  SET_LOADING: 'SET_LOADING',
  SET_LOADING_MORE: 'SET_LOADING_MORE',
  SET_TYPING: 'SET_TYPING',
  INITIAL_LOAD: 'INITIAL_LOAD',
  LOAD_MORE: 'LOAD_MORE',
  ADD_OPTIMISTIC: 'ADD_OPTIMISTIC',
  REMOVE_OPTIMISTIC: 'REMOVE_OPTIMISTIC',
  REALTIME_ADDED: 'REALTIME_ADDED',
  REALTIME_MODIFIED: 'REALTIME_MODIFIED',
};

const messagesInitialState = {
  messages: [],
  isTyping: false,
  lastDoc: null,
  hasMore: true,
  isLoading: true,
  isLoadingMore: false,
};

function messagesReducer(state, action) {
  switch (action.type) {
    case actionTypes.SET_LOADING:
      return { ...state, isLoading: action.payload };
    case actionTypes.SET_LOADING_MORE:
      return { ...state, isLoadingMore: action.payload };
    case actionTypes.SET_TYPING:
      return { ...state, isTyping: action.payload };
    case actionTypes.INITIAL_LOAD:
      return {
        ...state,
        messages: action.payload.messages,
        lastDoc: action.payload.lastDoc,
        hasMore: action.payload.hasMore,
        isLoading: false,
      };
    case actionTypes.LOAD_MORE:
      return {
        ...state,
        messages: [...action.payload.messages, ...state.messages],
        lastDoc: action.payload.lastDoc,
        hasMore: action.payload.hasMore,
        isLoadingMore: false,
      };
    case actionTypes.ADD_OPTIMISTIC:
      return { ...state, messages: [...state.messages, action.payload] };
    case actionTypes.REMOVE_OPTIMISTIC:
      return { ...state, messages: state.messages.filter(m => m.id !== action.payload.nonce) };
    case actionTypes.REALTIME_ADDED: {
      const message = action.payload;
      const optimisticIndex = message.nonce ? state.messages.findIndex(m => m.id === message.nonce) : -1;
      if (optimisticIndex > -1) {
        const newMessages = [...state.messages];
        newMessages[optimisticIndex] = message;
        return { ...state, messages: newMessages };
      }
      if (state.messages.some(m => m.id === message.id)) {
        return state;
      }
      return { ...state, messages: [...state.messages, message] };
    }
    case actionTypes.REALTIME_MODIFIED: {
      const message = action.payload;
      return {
        ...state,
        messages: state.messages.map(m => m.id === message.id ? { ...m, ...message } : m)
      };
    }
    default:
      throw new Error(`Unhandled action type: ${action.type}`);
  }
}

function useMessages(user) {
  const [state, dispatch] = useReducer(messagesReducer, messagesInitialState);
  const { messages, lastDoc, hasMore, isLoadingMore } = state;
  const { language } = useContext(LanguageContext);

  const sessionStartRef = useRef(new Date());
  const messagesRef = useRef(messages);
  const aiResponseCount = useRef(0);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  
  useEffect(() => {
    if (!user) return;

    let isMounted = true;

    const loadInitialMessages = async () => {
      dispatch({ type: actionTypes.SET_LOADING, payload: true });
      try {
        const q = query(collection(db, "messages"), orderBy("timestamp", "desc"), limit(20));
        const snapshot = await getDocs(q);
        if (!isMounted) return; // Prevent state update if component unmounted
        const initialMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), timestamp: doc.data().timestamp?.toDate() })).reverse();
        dispatch({
          type: actionTypes.INITIAL_LOAD,
          payload: {
            messages: initialMessages,
            lastDoc: snapshot.docs[snapshot.docs.length - 1],
            hasMore: snapshot.docs.length === 20,
          }
        });
      } catch (error) {
        console.error("Error loading initial messages:", error);
        toast.error("Could not load chat history.");
      } finally {
        // Ensure we don't try to update state on an unmounted component.
        if (isMounted) { 
          dispatch({ type: actionTypes.SET_LOADING, payload: false });
        }
      }
    };

    loadInitialMessages();

    const qRealtime = query(collection(db, "messages"), where("timestamp", ">=", sessionStartRef.current));
    const unsubscribe = onSnapshot(qRealtime, (snapshot) => {
      snapshot.docChanges().forEach(change => {
        const changedDoc = { id: change.doc.id, ...change.doc.data(), timestamp: change.doc.data().timestamp?.toDate() };
        if (change.type === "added") {
          dispatch({ type: actionTypes.REALTIME_ADDED, payload: changedDoc });
        }
        if (change.type === "modified") {
          dispatch({ type: actionTypes.REALTIME_MODIFIED, payload: changedDoc });
        }
      });
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [user]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore) return;
    dispatch({ type: actionTypes.SET_LOADING_MORE, payload: true });
    try {
      const q = query(collection(db, "messages"), orderBy("timestamp", "desc"), startAfter(lastDoc), limit(20));
      const snapshot = await getDocs(q);
      const olderMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), timestamp: doc.data().timestamp?.toDate() })).reverse();
      dispatch({
        type: actionTypes.LOAD_MORE,
        payload: {
          messages: olderMessages,
          lastDoc: snapshot.docs[snapshot.docs.length - 1],
          hasMore: snapshot.docs.length === 20,
        }
      });
    } catch (error) {
      console.error("Error loading more messages:", error);
      toast.error("Could not load older messages.");
    }
  }, [lastDoc, hasMore, isLoadingMore]);

  const sendMessage = useCallback(async (messageText) => {
    if (moderateContent(messageText)) {
      toast.error('Inappropriate content detected.');
      return;
    }

    const nonce = generateId();
    const optimisticMessage = { id: nonce, nonce, user: user.email, text: messageText, sender: 'user', timestamp: new Date(), tokens: messageText.split(/\s+/).length, sentiment: null, entities: [], translation: null };
    dispatch({ type: actionTypes.ADD_OPTIMISTIC, payload: optimisticMessage });
    
    aiResponseCount.current++;
    dispatch({ type: actionTypes.SET_TYPING, payload: true });

    let docRef;
    try {
      const messageForDb = { nonce, user: user.email, text: messageText, sender: 'user', timestamp: serverTimestamp(), tokens: messageText.split(/\s+/).length };
      docRef = await sendMessageToFirestore(messageForDb);
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Could not send message.");
      dispatch({ type: actionTypes.REMOVE_OPTIMISTIC, payload: { nonce } });
      aiResponseCount.current--;
      if (aiResponseCount.current === 0) {
        dispatch({ type: actionTypes.SET_TYPING, payload: false });
      }
      return;
    }

    const fetchAIResponse = async () => {
      try {
        const currentHistory = [...messagesRef.current, optimisticMessage];
        const responseText = await getAIResponse(messageText, currentHistory, language);
        const aiMessage = { user: user.email, text: responseText, sender: 'ai', timestamp: serverTimestamp(), tokens: responseText.split(/\s+/).length };
        await sendMessageToFirestore(aiMessage);
      } catch (error) {
        console.error("Error getting AI response:", error);
        toast.error("The AI failed to respond. Please try again.");
      } finally {
        aiResponseCount.current--;
        if (aiResponseCount.current === 0) {
            dispatch({ type: actionTypes.SET_TYPING, payload: false });
        }
      }
    };

    // Call the centralized analysis function and the AI response function
    analyzeAndSaveMessageFeatures(docRef, messageText, language);
    fetchAIResponse();

  }, [user, language]);

  return { ...state, loadMore, sendMessage };
}

// --- UI Components ---

function AITypingIndicator() {
  return (
    <div className="flex my-2 gap-4 justify-start">
      {/* This visually hidden element makes the typing indicator accessible to screen readers. */}
      <div role="status" className="sr-only">
        AI is typing...
      </div>
      <div className="p-4 rounded-2xl shadow-md bg-gray-100 dark:bg-gray-600">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <span className="h-2 w-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
          <span className="h-2 w-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
          <span className="h-2 w-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"></span>
        </div>
      </div>
    </div>
  );
}

function MessageSkeleton({ sender = 'ai' }) {
  const isUser = sender === 'user';
  return (
    <div className={`flex items-start gap-3 animate-pulse ${isUser ? 'flex-row-reverse ml-auto' : 'mr-auto'}`}>
      <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-600 flex-shrink-0"></div>
      <div className="p-4 rounded-2xl bg-gray-200 dark:bg-gray-600 w-48">
        <div className="h-4 bg-gray-300 dark:bg-gray-500 rounded w-5/6 mb-2"></div>
        <div className="h-4 bg-gray-300 dark:bg-gray-500 rounded w-1/2"></div>
      </div>
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="p-8 mt-8 bg-gray-50 dark:bg-gray-700/50 rounded-xl shadow-sm animate-pulse">
      <div className="h-8 bg-gray-200 dark:bg-gray-600 rounded w-3/4 mb-6"></div>
      <div className="h-6 bg-gray-200 dark:bg-gray-600 rounded w-1/2 mb-4"></div>
      <div className="h-6 bg-gray-200 dark:bg-gray-600 rounded w-1/3"></div>
    </div>
  );
}

const CopyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
);
const AnalyzeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M12 21v-1m0-10a5 5 0 00-5 5h10a5 5 0 00-5-5z" /></svg>
);

const ThemeToggleButton = () => {
  const { theme, toggleTheme } = useContext(ThemeContext);
  return (
    <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300" title="Toggle theme">
      {theme === 'light' ? (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 18v-1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M12 12a5 5 0 100-10 5 5 0 000 10z" /></svg>
      )}
    </button>
  );
};

const LanguageSelector = () => {
  const { language, setLanguage } = useContext(LanguageContext);

  return (
    <div className="relative">
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        className="p-2 rounded-full appearance-none bg-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer focus:outline-none"
        aria-label="Select language"
      >
        <option value="en">🇺🇸 English</option>
        <option value="hi">🇮🇳 हिन्दी</option>
      </select>
    </div>
  );
};

const Avatar = ({ sender, userEmail }) => {
  const isUser = sender === 'user';
  // Robustly get the first letter of the email, or 'U' as a fallback.
  const nameInitial = (userEmail || 'U').charAt(0).toUpperCase();
  const avatarSrc = isUser
    ? `https://ui-avatars.com/api/?name=${nameInitial}&background=ffc107&color=fff&bold=true`
    : `https://ui-avatars.com/api/?name=AI&background=4f46e5&color=fff&bold=true`;

  // Eager loading for small, critical images like avatars provides a better user experience.
  return <img src={avatarSrc} alt={`${sender} avatar`} className="h-8 w-8 rounded-full shadow-md flex-shrink-0" />;
};

const MessageItem = memo(function MessageItem({ message, performMessageAnalysis, analyzingIds }) {
  const t = useTranslation();
  const isUser = message.sender === 'user';
  // Check if the message has already been successfully analyzed.
  const isAnalyzed = !!(message.sentiment && message.entities && message.entities.length > 0);
  const isAnalyzing = analyzingIds.has(message.id);

  const handleCopy = () => {
    if (!navigator.clipboard) {
      toast.error('Clipboard access is not available in this browser.');
      return;
    }
    navigator.clipboard.writeText(message.text)
      .then(() => toast.success('Copied to clipboard!'))
      .catch(() => toast.error('Failed to copy.'));
  };

  const handleAnalyze = () => {
    if (isUser && !isAnalyzed && !isAnalyzing) {
      performMessageAnalysis(message.id, message.text);
    }
  };

  return (
    <div
      className={`relative flex items-start my-2 gap-3 group max-w-[85%] ${isUser ? 'flex-row-reverse ml-auto' : 'mr-auto'}`}
      role="listitem"
    >
      <Avatar sender={message.sender} userEmail={message.user} />

      <div className={`flex items-center gap-1 p-1 rounded-full bg-white dark:bg-gray-700 border dark:border-gray-600 shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-10 ${isUser ? 'mr-1' : 'ml-1'}`}>
        <button onClick={handleCopy} title="Copy text" aria-label="Copy message text" className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300">
          <CopyIcon />
        </button>
        {isUser && (
          <button
            onClick={handleAnalyze}
            title={isAnalyzed ? "Analysis complete" : (isAnalyzing ? "Analyzing..." : "Re-run analysis")}
            aria-label={isAnalyzed ? "Analysis complete" : (isAnalyzing ? "Analyzing message" : "Re-run analysis on message")}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 disabled:text-gray-300 dark:disabled:text-gray-500 disabled:cursor-not-allowed"
            disabled={isAnalyzed || isAnalyzing}
          >
            <AnalyzeIcon />
          </button>
        )}
      </div>

      <div
        className={`p-4 rounded-2xl shadow-md text-gray-800 dark:text-gray-100 ${
          isUser
            ? 'bg-gradient-to-r from-yellow-400 to-pink-400 text-white'
            : 'bg-gray-100 dark:bg-gray-600'
        }`}
      >
        <p className="text-base leading-relaxed whitespace-pre-wrap font-medium">{message.text}</p>
        {message.tokens && (
          <div className={`text-xs mt-2 opacity-70 ${message.sender === 'user' ? 'text-white/80' : 'text-gray-500'}`}>
            {message.tokens} tokens • {message.timestamp instanceof Date && !isNaN(message.timestamp) && new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
        {message.sentiment && (
          <div className="mt-2 text-xs">
            <span className="border border-yellow-300 dark:border-yellow-700 rounded-md px-2 py-0.5 bg-yellow-50 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300">Sentiment: {message.sentiment.score.toFixed(2)}</span>
          </div>
        )}
        {message.entities && message.entities.length > 0 && (
          <div className="mt-2 flex gap-2 flex-wrap text-xs">
            {message.entities.map((entity, idx) => (
              <span key={idx} className="border border-green-200 dark:border-green-700 rounded-md px-2 py-0.5 bg-green-50 dark:bg-green-900/50 text-green-800 dark:text-green-300">{entity.name} ({entity.type})</span>
            ))}
          </div>
        )}
        {message.translation && (
          <div className="mt-2 text-xs">
            <span className="border border-indigo-300 dark:border-indigo-700 rounded-md px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-300">{t('translationLabel')} {message.translation}</span>
          </div>
        )}
      </div>
    </div>
  );
});

function AnalyticsDashboard() {
  const [messageCount, setMessageCount] = useState(0);
  const [userCount, setUserCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const t = useTranslation();

  useEffect(() => {
    const getStats = async () => {
      try {
        const snapshot = await getDocs(collection(db, "messages"));
        setMessageCount(snapshot.size);
        const users = new Set(snapshot.docs.map(doc => doc.data().user));
        setUserCount(users.size);
      } catch (error) {
        console.error("Failed to get analytics data:", error);
      } finally {
        setLoading(false);
      }
    };
    getStats();
  }, []);

  if (loading) {
    return <AnalyticsSkeleton />;
  }

  return (
    <div className="p-8 mt-8 bg-gray-50 dark:bg-gray-700/50 rounded-xl shadow-sm">
      <h2 className="font-bold text-2xl text-gray-800 dark:text-gray-100">{t('analyticsDashboard')}</h2>
      <div className="mt-4 text-lg text-gray-700 dark:text-gray-300">{t('totalMessages')} {messageCount}</div>
      <div className="mt-2 text-lg text-gray-700 dark:text-gray-300">{t('uniqueUsers')} {userCount}</div>
    </div>
  );
}

function ChatComponent({ user }) {
  const { messages, isTyping, isLoading, hasMore, isLoadingMore, loadMore, sendMessage } = useMessages(user);
  const { performMessageAnalysis, analyzingIds } = useMessageAnalysis();
  const t = useTranslation();
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!isLoadingMore) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping, isLoadingMore]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    sendMessage(inputMessage);
    setInputMessage('');
  };

  return (
    <div className="mt-6">
      <div className="h-[60vh] overflow-y-auto p-4 border rounded-lg bg-gray-50 dark:bg-gray-900/50 dark:border-gray-700 space-y-4" role="log" aria-live="polite">
        {isLoading ? (
          <div className="space-y-4">
            <MessageSkeleton />
            <MessageSkeleton sender="user" />
            <MessageSkeleton />
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="text-center">
                <button onClick={handleLoadMore} disabled={isLoadingMore} className="text-blue-500 hover:underline disabled:text-gray-400 dark:text-blue-400 dark:disabled:text-gray-500">
                  {isLoadingMore ? t('loadingMore') : t('loadMore')}
                </button>
              </div>
            )}
            {messages.map(message => <MessageItem key={message.id} message={message} performMessageAnalysis={performMessageAnalysis} analyzingIds={analyzingIds} />)}
          </>
        )}
        {isTyping && !isLoading && <AITypingIndicator />}
        <div ref={messagesEndRef} />
      </div>
      {showScrollToBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 px-4 py-2 bg-blue-500 text-white rounded-full shadow-lg flex items-center gap-2 text-sm animate-bounce"
          aria-label="Scroll to new messages"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
          New Messages
        </button>
      )}

      <form onSubmit={handleSendMessage} className="mt-4 flex">
        <input type="text" value={inputMessage} onChange={(e) => setInputMessage(e.target.value)} className="flex-grow p-2 border rounded-l-md bg-white dark:bg-gray-800 dark:border-gray-600 text-gray-800 dark:text-gray-100 placeholder-gray-400" aria-label="Your message" placeholder={t('messagePlaceholder')} disabled={isTyping || !user} />
        <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded-r-md" disabled={isTyping || !user}>
          {t('send')}
        </button>
      </form>
    </div>
  );
}

// --- Error Boundary Component ---
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // You can also log the error to an error reporting service
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <div className="p-8 text-center text-red-500 dark:text-red-400"><h2 className="text-2xl font-bold">Something went wrong.</h2><p className="mt-2">Please try refreshing the page.</p></div>;
    }

    return this.props.children;
  }
}

// --- Main App Component ---
function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </LanguageProvider>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  const t = useTranslation();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center text-gray-500 dark:text-gray-400">
        {t('loadingApp')}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col items-center p-4 font-sans">
      <Toaster position="top-center" />
      <div className="w-full max-w-3xl bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
        <ErrorBoundary>
          <h1 className="text-3xl font-bold mb-4 text-center text-gray-800 dark:text-gray-100">
            {t('appName')}
          </h1>
          {user ? (
            <div>
              <div className="flex items-center justify-between mb-4 border-b pb-4 dark:border-gray-700">
                <div className="text-sm text-gray-600 dark:text-gray-300">
                  {t('loggedInAs')} <span className="font-semibold">{user.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <LanguageSelector />
                  <ThemeToggleButton />
                  <button onClick={signOutUser} className="px-4 py-2 text-sm bg-red-500 text-white rounded-md shadow-md hover:bg-red-600 transition-colors">
                    {t('signOut')}
                  </button>
                </div>
              </div>
              <ChatComponent user={user} />
              <AnalyticsDashboard />
            </div>
          ) : (
            <div className="flex flex-col items-center text-center py-16">
              <h2 className="text-xl font-semibold mb-2 text-gray-700 dark:text-gray-200">
                {t('welcomeTitle')}
              </h2>
              <p className="mb-6 text-gray-500 dark:text-gray-400">
                {t('welcomeSubtitle')}
              </p>
              <button onClick={signInWithGoogle} className="px-6 py-3 text-lg bg-blue-500 text-white rounded-md shadow-md hover:bg-blue-600 transition-colors flex items-center gap-2">
                {t('signInWithGoogle')}
              </button>
            </div>
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default App;
