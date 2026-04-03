import React from 'react';

export default function App() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
        background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
        color: 'white',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '1rem' }}>
          Resume Score Admin
        </h1>
        <p style={{ color: '#a0aec0', fontSize: '1.1rem' }}>
          Internal dashboard — Under construction
        </p>
      </div>
    </div>
  );
}
