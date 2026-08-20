# PromptLab

PromptLab is an LLM Prompt Engineering & Evaluation Platform.

## Project Structure

```
PromptLab/
├── frontend/    # React + Vite + TypeScript frontend application
├── backend/     # Node.js + Express + TypeScript backend API
├── docs/        # Project architecture and technical documentation
├── .gitignore   # Git ignore configuration
└── README.md    # Main project README
```

## Quick Start Guide

### Prerequisites
- Node.js (v18+ recommended)
- npm (v9+ recommended)

---

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy environment configuration:
   ```bash
   cp .env.example .env
   ```
4. Start the backend development server:
   ```bash
   npm run dev
   ```
   The backend server will run at `http://localhost:5000`.

5. Verify backend health endpoint:
   ```bash
   curl http://localhost:5000/api/health
   ```

---

### Frontend Setup

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy environment configuration:
   ```bash
   cp .env.example .env
   ```
4. Start the frontend development server:
   ```bash
   npm run dev
   ```
   The frontend application will run at `http://localhost:5173`.

---

### Available Scripts

#### Backend (`/backend`)
- `npm run dev`: Runs the backend in watch mode using `tsx`.
- `npm run build`: Compiles TypeScript code to `dist/`.
- `npm run start`: Runs the compiled JavaScript from `dist/server.js`.

#### Frontend (`/frontend`)
- `npm run dev`: Starts the Vite development server.
- `npm run build`: Type-checks and builds the production bundle.
- `npm run preview`: Previews the production build locally.
