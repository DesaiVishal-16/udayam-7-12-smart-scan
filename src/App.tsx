import React, { useState, useEffect } from "react";
import { 
  BarChart3, 
  History, 
  LayoutDashboard, 
  Menu, 
  X, 
  Sun, 
  Moon,
  ChevronLeft,
  ChevronRight,
  ShieldCheck
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Dashboard from "./components/Dashboard";
import HistoryPage from "./components/HistoryPage";
import { Logo, CreditLine } from "./components/Branding";
import { cn } from "./lib/utils";

type Page = "dashboard" | "history";

export default function App() {
  const [activePage, setActivePage] = useState<Page>("dashboard");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "history", label: "History", icon: History },
  ];

  return (
    <div className="min-h-screen flex bg-slate-100 w-full">
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed left-0 top-0 h-full bg-white text-slate-900 border-r border-slate-200 shadow-sm z-50 flex flex-col transition-transform duration-300",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        sidebarCollapsed ? "lg:w-20" : "lg:w-64",
        "w-64"
      )}>
        {/* Logo */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          {sidebarCollapsed ? (
            <div className="flex justify-center w-full">
              <img src="/logo.png" alt="Logo" className="h-8 w-auto" />
            </div>
          ) : (
            <Logo />
          )}
          <button 
            className="lg:hidden p-1 hover:bg-slate-100 rounded"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { setActivePage(item.id as Page); setMobileMenuOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all",
                activePage === item.id
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 hover:text-blue-600 hover:bg-slate-50"
              )}
            >
              <item.icon className="w-5 h-5" />
              {!sidebarCollapsed && <span className="font-medium">{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* Collapse Button - Desktop only */}
        <button 
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="hidden lg:flex p-4 border-t border-slate-200 items-center justify-center hover:bg-slate-50 transition-colors"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <ChevronLeft className="w-5 h-5" />
              <span>Collapse</span>
            </div>
          )}
        </button>
      </aside>

      {/* Main Content */}
      <div className={cn(
        "flex flex-col min-h-screen w-full",
        sidebarCollapsed ? "lg:pl-20" : "lg:pl-64"
      )}>
        {/* Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-40 flex-shrink-0">
          <div className="flex justify-between items-center h-[73px] px-4 lg:px-6 w-full">
            <div className="flex items-center gap-3">
              <button 
                className="lg:hidden p-2 -ml-2 hover:bg-slate-100 rounded-lg"
                onClick={() => setMobileMenuOpen(true)}
              >
                <Menu className="w-6 h-6" />
              </button>
              <h2 className="text-xl lg:text-2xl font-bold text-blue-600">
                7/12 Smart Scan
              </h2>
            </div>
            
            <div className="flex items-center gap-2 lg:gap-3 px-2 lg:px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100">
              <ShieldCheck className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">Secure AI</span>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex-1 p-3 lg:p-6 w-full">
          {activePage === "dashboard" && <Dashboard />}
          {activePage === "history" && <HistoryPage />}
        </div>

        {/* Footer */}
        <footer className="bg-white border-t border-slate-200 flex-shrink-0 w-full">
          <div className="px-4 lg:px-6 py-[15px]">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-2">
              <p className="text-xs text-slate-400">
                © {new Date().getFullYear()} Udayam AI Labs. All rights reserved.
              </p>
              <CreditLine />
            </div>
          </div>
        </footer>
      </div>

      {/* Sidebar Toggle (Mobile) */}
      {!isSidebarOpen && (
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className={cn(
            "fixed bottom-6 left-6 z-50 p-4 bg-blue-600 text-white rounded-full shadow-lg lg:hidden",
            isSidebarOpen ? "hidden" : "flex"
          )}
        >
          <Menu className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}