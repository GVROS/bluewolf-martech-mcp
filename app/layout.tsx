export const metadata = {
  title: "Bluewolf MarTech MCP Gateway",
  description: "Read-only MCP gateway for Salesforce Marketing Cloud"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "Arial, sans-serif", margin: 40 }}>{children}</body>
    </html>
  );
}
