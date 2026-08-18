# 人員配置最適化・シミュレーションアプリ

Personnel allocation optimization and simulation application for matching company needs with employee career aspirations.

## Features

### Admin Features
- Personnel allocation simulation with skill matching
- Expected revenue and growth rate calculation
- Dashboard with key metrics and analytics
- Allocation decision sending with feedback
- HR consultation request management

### Employee Features
- My Page: Update profile, skills, and career goals
- View allocation feedback with reasons and learning recommendations
- Request HR consultation meetings
- Track allocation status

## Tech Stack

### Frontend
- **Framework**: Angular 22
- **Language**: TypeScript 6.0
- **Styling**: SCSS
- **HTTP**: RxJS

### Backend
- **Runtime**: Node.js
- **Framework**: Express
- **Language**: TypeScript
- **Database ORM**: Prisma
- **Database**: PostgreSQL
- **Authentication**: JWT

## Setup Instructions

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file:
```bash
cp .env.example .env
```

4. Update `.env` with your PostgreSQL connection string

5. Generate Prisma client and run migrations:
```bash
npm run prisma:generate
npm run prisma:migrate
```

6. Start the server:
```bash
npm run dev
```

### Frontend Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

Frontend: `http://localhost:4200`
Backend: `http://localhost:3000`

## Key Features

- **Simulation Algorithm**: Matches candidates based on performance score (50%) and skills match (50%)
- **Data Validation**: Missing numerical values treated as 0
- **Access Control**: Admins have full access; employees can only view their own data
- **JWT Authentication**: Secure token-based authentication
