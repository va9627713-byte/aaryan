// ...existing imports...

// Database integration (MongoDB)
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI);

const MessageSchema = new mongoose.Schema({
  user: String,
  text: String,
  timestamp: Date,
  sentiment: Object,
  entities: Array,
  translation: String
});
const Message = mongoose.model('Message', MessageSchema);

// Save message
async function saveMessageToDB(msg) {
  const message = new Message(msg);
  await message.save();
}

// Get chat history
async function getChatHistory(user) {
  return await Message.find({ user }).sort({ timestamp: 1 });
}

// Add Google Cloud API functions
const analyzeSentiment = async (text) => {
  try {
    const response = await fetch("http://localhost:5000/api/google-sentiment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error("Sentiment API error");
    const data = await response.json();
    return data; // { score, magnitude }
  } catch (err) {
    return null;
  }
};

const analyzeEntities = async (text) => {
  try {
    const response = await fetch("http://localhost:5000/api/google-entities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error("Entity API error");
    const data = await response.json();
    return data.entities;
  } catch (err) {
    return [];
  }
};

const translateText = async (text, target) => {
  try {
    const response = await fetch("http://localhost:5000/api/google-translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, target }),
    });
    if (!response.ok) throw new Error("Translation API error");
    const data = await response.json();
    return data.translation;
  } catch (err) {
    return "";
  }
};

// Analytics setup (Winston)
const winston = require('winston');
const logger = winston.createLogger({
  transports: [new winston.transports.Console()]
});

function logRequest(req, res, next) {
  logger.info(`${req.method} ${req.url}`);
  next();
}
// Use in Express: app.use(logRequest);

// Moderation middleware
function moderateContent(text) {
  const bannedWords = ['badword1', 'badword2'];
  return bannedWords.some(word => text.includes(word));
}

// JWT Authentication setup
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  username: String,
  password: String
});
const User = mongoose.model('User', UserSchema);

// Registration endpoint
async function registerUser(username, password) {
  const hashed = await bcrypt.hash(password, 10);
  const user = new User({ username, password: hashed });
  await user.save();
  return { success: true };
}

// Login endpoint
async function loginUser(username, password) {
  const user = await User.findOne({ username });
  if (!user) return { error: 'User not found' };
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return { error: 'Invalid password' };
  const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { token };
}

// Auth middleware
function authenticate(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

// Example usage in Express:
// app.post('/api/register', async (req, res) => {
//   const { username, password } = req.body;
//   const result = await registerUser(username, password);
//   res.json(result);
// });
// app.post('/api/login', async (req, res) => {
//   const { username, password } = req.body;
//   const result = await loginUser(username, password);
//   res.json(result);
// });
// app.use((req, res, next) => {
//   const token = req.headers.authorization?.split(' ')[1];
//   const user = authenticate(token);
//   if (!user) return res.status(401).json({ error: 'Unauthorized' });
//   req.user = user;
//   next();
// });

const sendMessage = async (message, user) => {
  if (!message.trim()) return;
  if (moderateContent(message)) {
    toast.error('Inappropriate content detected.');
    return;
  }
  // Add user message
  const userMessage = {
    user,
    id: generateId(),
    text: message,
    sender: 'user',
    timestamp: new Date(),
    tokens: message.split(' ').length,
    sentiment: null,
    entities: [],
    translation: null
  };
  setMessages(prev => [...prev, userMessage]);
  setInputMessage("");
  setIsTyping(true);

  // Analyze sentiment
  const sentiment = await analyzeSentiment(message);
  if (sentiment) {
    toast.info(`Sentiment: Score ${sentiment.score}, Magnitude ${sentiment.magnitude}`);
    userMessage.sentiment = sentiment;
  }

  // Analyze entities
  const entities = await analyzeEntities(message);
  if (entities && entities.length > 0) {
    toast.info(`Entities: ${entities.map(e => e.name).join(', ')}`);
    userMessage.entities = entities;
  }

  // Optionally translate to Hindi (example)
  const translation = await translateText(message, 'hi');
  if (translation) {
    userMessage.translation = translation;
  }

  // Save to DB
  await saveMessageToDB(userMessage);

  // Update message with AI features
  setMessages(prev => prev.map(m => m.id === userMessage.id ? userMessage : m));

  // Simulate realistic AI response time
  const delay = Math.max(1000, Math.min(4000, message.length * 50));
  setTimeout(async () => {
    const response = generateAIResponse(message, messages);
    const aiMessage = {
      user,
      id: generateId(),
      text: response,
      sender: 'ai',
      timestamp: new Date(),
      tokens: response.split(' ').length
    };
    setMessages(prev => [...prev, aiMessage]);
    setIsTyping(false);
    await saveMessageToDB(aiMessage);
  }, delay);
};

// Firebase config (replace with your credentials)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  // ...other config
};

// Firestore setup
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy } from "firebase/firestore";
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Send message to Firestore
async function sendMessageToFirestore(messageObj) {
  await addDoc(collection(db, "messages"), messageObj);
}

// Subscribe to real-time messages
function subscribeToMessages(callback) {
  const q = query(collection(db, "messages"), orderBy("timestamp"));
  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(doc => doc.data());
    callback(messages);
  });
}

// Firebase Authentication setup
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Sign in with Google
async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Google sign-in error:", error);
  }
}

// Sign out
async function signOutUser() {
  await signOut(auth);
}

// Listen for auth state changes
function subscribeToAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

// Simple Analytics Dashboard (usage stats)
import { useEffect, useState } from "react";
function AnalyticsDashboard() {
  const [messageCount, setMessageCount] = useState(0);
  const [userCount, setUserCount] = useState(0);

  useEffect(() => {
    // Count messages in Firestore
    const q = query(collection(db, "messages"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessageCount(snapshot.size);
      const users = new Set(snapshot.docs.map(doc => doc.data().user));
      setUserCount(users.size);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div style={{padding:'2rem',background:'#f9fafb',borderRadius:'12px',boxShadow:'0 2px 8px #e5e7eb'}}>
      <h2 style={{fontWeight:'bold',fontSize:'1.5rem'}}>Analytics Dashboard</h2>
      <div style={{marginTop:'1rem',fontSize:'1.1rem'}}>Total Messages: {messageCount}</div>
      <div style={{marginTop:'0.5rem',fontSize:'1.1rem'}}>Unique Users: {userCount}</div>
    </div>
  );
}

// Polished message rendering with Google Cloud AI features
function renderMessage(message) {
  return (
    <div
      key={message.id}
      className={`flex gap-4 ${message.sender === 'user' ? 'justify-end' : 'justify-start'} group`}
      aria-live="polite"
      tabIndex={0}
      role="region"
      aria-label={message.sender === 'user' ? 'Your message' : 'AI response'}
      style={{ maxWidth: '85%' }}
    >
      <div className={`p-4 rounded-2xl shadow-md ${
        message.sender === 'user'
          ? 'bg-gradient-to-r from-yellow-400 to-pink-400 text-white'
          : 'bg-gray-100 backdrop-blur border border-blue-200'
      }`}>
        <p className="text-base leading-relaxed whitespace-pre-wrap font-medium">{message.text}</p>
        {message.tokens && (
          <div className={`text-xs mt-2 opacity-70 ${message.sender === 'user' ? 'text-white/80' : 'text-gray-500'}`}>
            {message.tokens} tokens • {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
        {/* Google Cloud AI results */}
        {message.sentiment && (
          <div className="mt-2 flex gap-2 text-xs">
            <span style={{border:'1px solid #fbbf24',borderRadius:'6px',padding:'2px 8px',background:'#fffbe6'}}>Sentiment: {message.sentiment.score} ({message.sentiment.magnitude})</span>
          </div>
        )}
        {message.entities && message.entities.length > 0 && (
          <div className="mt-2 flex gap-2 flex-wrap text-xs">
            {message.entities.map((entity, idx) => (
              <span key={idx} style={{border:'1px solid #a7f3d0',borderRadius:'6px',padding:'2px 8px',background:'#f0fdf4'}}>{entity.name}</span>
            ))}
          </div>
        )}
        {message.translation && (
          <div className="mt-2 text-xs">
            <span style={{border:'1px solid #818cf8',borderRadius:'6px',padding:'2px 8px',background:'#eef2ff'}}>Hindi: {message.translation}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Example React chat component
import { useEffect, useState } from "react";
function ChatComponent() {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribeToMessages(setMessages);
    return () => unsubscribe();
  }, []);

  // ...input and send logic...

  return (
    <div>
      {messages.map(renderMessage)}
      {/* ...input area for sending messages... */}
    </div>
  );
}

// Example React component for authentication and analytics
function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeToAuth(setUser);
    return () => unsubscribe();
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Chat Application</h1>
      {user ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-sm text-gray-500">Logged in as:</span>
              <span className="font-semibold">{user.email}</span>
            </div>
            <button
              onClick={signOutUser}
              className="px-4 py-2 text-sm bg-red-500 text-white rounded-md shadow-md hover:bg-red-600"
            >
              Sign out
            </button>
          </div>
          <ChatComponent />
          <AnalyticsDashboard />
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <h2 className="text-xl font-semibold mb-4">Welcome to the Chat App</h2>
          <button
            onClick={signInWithGoogle}
            className="px-6 py-3 text-lg bg-blue-500 text-white rounded-md shadow-md hover:bg-blue-600"
          >
            Sign in with Google
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
