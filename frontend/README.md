# Beskarfolio Frontend

A React TypeScript frontend for the portfolio tracking application.

## Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **Shadcn UI** - Component library
- **Axios** - HTTP client for API requests
- **Recharts** - Charts and data visualization
- **Lucide React** - Icon library

## Project Structure

```
src/
├── components/
│   ├── ui/               # Shadcn UI components
│   │   └── button.tsx
│   ├── PriceUpdateButton.tsx
│   └── PortfolioSummary.tsx
├── hooks/
│   └── useUpdatePrices.ts
├── lib/
│   └── utils.ts          # Utility functions
├── App.tsx               # Main app component
├── main.tsx              # App entry point
└── index.css             # Global styles
```

## Getting Started

1. Install dependencies:
```bash
cd frontend
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open http://localhost:3000 in your browser

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Components

### PriceUpdateButton
Shadcn UI button component that triggers the `/api/prices/update` endpoint to fetch current prices from yfinance. Shows loading state and error handling.

### PortfolioSummary
Displays key portfolio metrics:
- Total Value
- Total Invested
- Total Gain %
- Total Dividends
- Holdings Count

### useUpdatePrices Hook
Custom React hook for managing price update API calls with loading and error states.

## Backend Integration

The frontend expects the following API endpoints:
- `POST /api/prices/update` - Update stock prices
- `GET /api/portfolio/summary` - Get portfolio summary data

## Development

The app uses Vite's proxy configuration to forward `/api` requests to `http://localhost:8060` (FastAPI backend).

## Styling

Uses Tailwind CSS with Shadcn UI components. The color scheme follows a dark/light theme with CSS variables defined in `index.css`.