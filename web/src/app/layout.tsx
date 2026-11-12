import React from 'react';

export const metadata = {
  title: 'Canvello — Architecture Explorer',
  description: 'Visual software architecture exploration and experimentation platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, backgroundColor: '#FFFFFF', color: '#29152F' }}>
        {children}
      </body>
    </html>
  );
}
