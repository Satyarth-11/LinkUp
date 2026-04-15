# LinkUp — Secure Real-Time Chat Platform

A full-stack real-time chat application built with **React**, **Node.js + Express**, **MongoDB**, and **Socket.IO**.

## Features

| Feature | Details |
|---|---|
| 🔐 Authentication | JWT-based login/register with bcrypt password hashing |
| 👥 Group Chat | Password-protected rooms with multiple users |
| 🔒 Private Chat | One-on-one rooms between two registered users |
| 🎭 Anonymous Chat | Toggle anonymity per-message in any room |
| ⚡ Random Chat | Instant stranger matching queue (Omegle-style) |
| 📷 Image Sharing | Upload and share images in group/private rooms |
| 💬 Typing Indicators | Live "User is typing..." indicator |
| 📜 Chat History | Persistent message history via MongoDB |
| 🌐 Real-time | Socket.IO for instant bidirectional messaging |

---

## Tech Stack

- **Frontend:** React 18 + Vite + Tailwind CSS
- **Backend:** Node.js + Express + Socket.IO
- **Database:** MongoDB + Mongoose
- **Auth:** JWT (jsonwebtoken) + bcryptjs
- **File Upload:** Multer

---

## Prerequisites

- Node.js v18+
- MongoDB (local or MongoDB Atlas)
- npm

---

## Setup & Run

### 1. Clone / Extract the project

```
linkup/
├── backend/
└── frontend/
```

### 2. Backend Setup

```bash
cd linkup/backend
npm install
```

Edit `.env` if needed:
```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/linkup
JWT_SECRET=your_secret_key_here
FRONTEND_URL=http://localhost:5173
BASE_URL=http://localhost:5000
```

Start the backend:
```bash
npm run dev      # with nodemon (development)
# or
npm start        # production
```

You should see:
```
✅ MongoDB Connected
🚀 LinkUp Server running on port 5000
```

### 3. Frontend Setup

```bash
cd linkup/frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## MongoDB Atlas (Cloud)

If you don't have MongoDB locally, use Atlas (free tier):

1. Go to https://cloud.mongodb.com
2. Create a free cluster
3. Get the connection string and set it as `MONGO_URI` in `.env`:

```env
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/linkup
```

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register user |
| POST | `/api/auth/login` | Login, returns JWT |
| POST | `/api/auth/logout` | Logout (requires token) |
| GET | `/api/auth/verify` | Verify JWT token |

### Rooms
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/room/create-group` | Create password-protected group room |
| POST | `/api/room/join-group` | Join existing group room |
| POST | `/api/room/private` | Get/create private 1-on-1 room |
| GET | `/api/room/:roomId` | Get room info |
| GET | `/api/room/:roomId/messages` | Get message history |

### Upload
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/upload` | Upload image (multipart/form-data) |

---

## Socket.IO Events

### Client → Server
| Event | Payload | Description |
|---|---|---|
| `join_room` | `{roomId, displayName, isAnonymous}` | Join a room |
| `send_message` | `{roomId, text, image, isAnonymous, displayName}` | Send message |
| `typing` | `{roomId, isTyping, displayName}` | Typing indicator |
| `leave_room` | `{roomId, displayName}` | Leave a room |
| `join_random` | `{username}` | Join random queue |
| `leave_random` | — | Leave random chat |

### Server → Client
| Event | Payload | Description |
|---|---|---|
| `chat_history` | `[Message]` | Message history on join |
| `receive_message` | `Message` | New message |
| `user_joined` | `{username, message}` | Someone joined |
| `user_left` | `{username, message}` | Someone left |
| `user_typing` | `{username, isTyping}` | Typing status |
| `random_waiting` | `{message}` | Waiting in queue |
| `random_matched` | `{roomId}` | Paired with stranger |

---

## Database Schema

### User
```js
{ username, password (hashed), status, lastSeen, createdAt }
```

### Room
```js
{ roomId, name, password (hashed), type: 'private'|'group'|'random', createdBy, members, isActive }
```

### Message
```js
{ roomId, sender, displayName, text, image, type, isAnonymous, timestamp }
```
