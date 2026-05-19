import React from 'react'

interface LoadingSpinnerProps {
  message?: string
  size?: 'sm' | 'md' | 'lg'
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  message = 'Loading...', 
  size = 'md' 
}) => {
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  }

  return (
    <div className="text-center py-8">
      <div className={`animate-spin rounded-full border-b-2 border-accent-500 mx-auto ${sizeClasses[size]}`}></div>
      <p className="mt-4 text-gray-400">{message}</p>
    </div>
  )
}
