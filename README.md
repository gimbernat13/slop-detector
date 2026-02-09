# Slop Detector

A comprehensive tool to detect and classify low-quality "slop" content on YouTube using AI.

## Getting Started

To run this project locally using Docker:

### 1. Prerequisites
- Docker & Docker Compose
- Git

### 2. Clone the Repository
```bash
git clone https://github.com/gimbernat13/slop-detector.git
cd slop-detector
```

### 3. Setup Environment Variables
Create a `.env` file in the root directory. You will need the API keys from the project owner.

```bash
cp .env.example .env
# Edit .env and add your keys
```

### 4. Run with Docker
```bash
docker-compose up -d --build
```

The app will be available at `http://localhost:3001`.
