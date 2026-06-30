import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="px-4 lg:px-6 h-16 flex items-center border-b">
        <Link className="flex items-center justify-center gap-2 group" to="/">
          <div className="h-9 w-9 bg-black rounded-xl flex items-center justify-center group-hover:rotate-6 transition-all border border-slate-800 shadow-lg">
             <span className="text-white font-black text-lg">P</span>
          </div>
          <span className="font-black text-3xl tracking-tighter text-slate-900">PaymentBlack</span>
        </Link>
        <nav className="ml-auto flex gap-4 sm:gap-6">
          <Link className="text-sm font-medium hover:underline underline-offset-4" to="/auth">
            Entrar
          </Link>
          <Link className="text-sm font-medium hover:underline underline-offset-4" to="/auth">
            Criar Conta
          </Link>
        </nav>
      </header>
      <main className="flex-1">
        <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48 bg-slate-50">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center space-y-8 text-center max-w-4xl mx-auto">
              <div className="space-y-4">
                <div className="inline-flex items-center px-3 py-1 rounded-full bg-black/10 text-black text-xs font-bold uppercase tracking-wider mb-2 animate-bounce">
                  Novo: Checkout Inteligente Disponível
                </div>
                <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900">
                  Venda em Moçambique com M-Pesa e e-Mola
                </h1>
                <p className="mx-auto max-w-[800px] text-gray-500 text-lg md:text-xl leading-relaxed">
                  A plataforma de checkout mais completa para empreendedores moçambicanos. 
                  Segurança, facilidade e conversão em um só lugar. Integrada com as maiores operadoras locais.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                <Link
                  to="/auth"
                  className="inline-flex h-14 items-center justify-center rounded-xl bg-black px-10 text-base font-bold text-white shadow-xl shadow-black/20 transition-all hover:scale-105 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Começar Agora Grátis
                </Link>
                <Link
                  to="/auth"
                  className="inline-flex h-14 items-center justify-center rounded-xl border border-input bg-background px-10 text-base font-bold shadow-sm transition-all hover:bg-accent hover:text-accent-foreground"
                >
                  Ver Demonstração
                </Link>
              </div>
              <div className="flex items-center gap-8 pt-8 grayscale opacity-50">
                <img src="/mpesa-logo.jpg" alt="M-Pesa" className="h-8 md:h-12 w-auto object-contain" />
                <img src="/emola-logo.jpg" alt="e-Mola" className="h-8 md:h-12 w-auto object-contain" />
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-gray-500">© 2026 Paymentblack Mozambique. Todos os direitos reservados.</p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <Link className="text-xs hover:underline underline-offset-4" to="/">
            Termos de Serviço
          </Link>
          <Link className="text-xs hover:underline underline-offset-4" to="/">
            Privacidade
          </Link>
        </nav>
      </footer>
    </div>
  );
}
