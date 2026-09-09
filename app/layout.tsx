import "./globals.css";

export const metadata = {
  title: "Bluewolf MarTech Journey Factory",
  description:
    "End-to-end MarTech journey factory connecting IBM Consulting Advantage, Salesforce Marketing Cloud and Data Cloud governance.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
