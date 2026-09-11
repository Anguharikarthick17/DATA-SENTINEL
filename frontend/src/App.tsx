import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { Dashboard } from '@/pages/Dashboard';
import { DataPage } from '@/pages/Data';
import { ChatPage } from '@/pages/Chat';
import { GraphPage } from '@/pages/Graph';
import { SecurityPage } from '@/pages/Security';

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden bg-[#060810]">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/data" element={<DataPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/graph" element={<GraphPage />} />
            <Route path="/security" element={<SecurityPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
