/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { GoogleGenAI, Type } from "@google/genai";
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  deleteDoc,
  doc, 
  Timestamp 
} from "firebase/firestore";
import { db } from "./firebase";
import { 
  Brain, 
  Plus, 
  Sparkles, 
  RotateCcw, 
  CheckCircle2, 
  Zap, 
  ChevronRight,
  Loader2,
  BookOpen,
  Trash2,
  Settings,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Types
interface Flashcard {
  id?: string;
  front: string;
  back: string;
  example: string;
  interval: number;
  nextReview: Timestamp;
  createdAt: Timestamp;
}

export default function App() {
  const [theme, setTheme] = useState("");
  const [manualCard, setManualCard] = useState({ front: "", back: "", example: "" });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [view, setView] = useState<"home" | "review" | "generate" | "manual" | "manage">("home");
  const [stats, setStats] = useState({ total: 0, due: 0 });
  const [allCards, setAllCards] = useState<Flashcard[]>([]);

  // Initialize Gemini
  const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const qAll = query(collection(db, "cards"));
      const allSnap = await getDocs(qAll);
      
      const now = new Date();
      const qDue = query(collection(db, "cards"), where("nextReview", "<=", Timestamp.fromDate(now)));
      const dueSnap = await getDocs(qDue);
      
      setStats({
        total: allSnap.size,
        due: dueSnap.size
      });
    } catch (e) {
      console.error("Error fetching stats:", e);
    }
  };

  const startReview = async () => {
    const now = new Date();
    const q = query(collection(db, "cards"), where("nextReview", "<=", Timestamp.fromDate(now)));
    const querySnapshot = await getDocs(q);
    const dueCards = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Flashcard));
    
    if (dueCards.length === 0) {
      alert("Nenhum cartão para revisar agora!");
      return;
    }

    setCards(dueCards);
    setCurrentCardIndex(0);
    setIsFlipped(false);
    setView("review");
  };

  const openManage = async () => {
    const q = query(collection(db, "cards"));
    const querySnapshot = await getDocs(q);
    const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Flashcard));
    setAllCards(list);
    setView("manage");
  };

  const deleteCard = async (id: string, fromReview: boolean = false) => {
    if (!confirm("Tem certeza que deseja excluir este cartão?")) return;

    try {
      await deleteDoc(doc(db, "cards", id));
      
      if (fromReview) {
        const newReviewCards = cards.filter(c => c.id !== id);
        setCards(newReviewCards);
        if (currentCardIndex >= newReviewCards.length && newReviewCards.length > 0) {
          setCurrentCardIndex(newReviewCards.length - 1);
        } else if (newReviewCards.length === 0) {
          setView("home");
        }
        setIsFlipped(false);
      } else {
        setAllCards(prev => prev.filter(c => c.id !== id));
      }
      
      await fetchStats();
      alert("Cartão excluído.");
    } catch (error) {
      console.error("Error deleting card:", error);
      alert("Erro ao excluir cartão.");
    }
  };

  const saveManualCard = async () => {
    if (!manualCard.front.trim() || !manualCard.back.trim()) {
      alert("Por favor, preencha pelo menos a frente e o verso.");
      return;
    }
    
    setIsSaving(true);
    try {
      const now = new Date();
      await addDoc(collection(db, "cards"), {
        ...manualCard,
        interval: 1,
        nextReview: Timestamp.fromDate(now),
        createdAt: Timestamp.fromDate(now)
      });

      setManualCard({ front: "", back: "", example: "" });
      await fetchStats();
      setView("home");
      alert("Cartão adicionado com sucesso!");
    } catch (error) {
      console.error("Error saving card:", error);
      alert("Erro ao salvar cartão.");
    } finally {
      setIsSaving(false);
    }
  };

  const generateCards = async () => {
    if (!theme.trim()) return;
    setIsGenerating(true);
    
    try {
      const model = "gemini-3-flash-preview";
      const response = await genAI.models.generateContent({
        model,
        contents: `Generate 3 English learning flashcards about the theme: "${theme}". 
        Return ONLY a JSON array of objects with fields: front (the English word/phrase), back (Portuguese translation), and example (an English sentence using it).`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                front: { type: Type.STRING },
                back: { type: Type.STRING },
                example: { type: Type.STRING }
              },
              required: ["front", "back", "example"]
            }
          }
        }
      });

      const generated = JSON.parse(response.text || "[]");
      const now = new Date();
      
      for (const card of generated) {
        await addDoc(collection(db, "cards"), {
          ...card,
          interval: 1,
          nextReview: Timestamp.fromDate(now),
          createdAt: Timestamp.fromDate(now)
        });
      }

      setTheme("");
      await fetchStats();
      setView("home");
      alert("3 novos cartões gerados com sucesso!");
    } catch (error) {
      console.error("Generation error:", error);
      alert("Erro ao gerar cartões. Verifique sua conexão e chaves de API.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReview = async (quality: "hard" | "good" | "easy") => {
    const card = cards[currentCardIndex];
    if (!card.id) return;

    let newInterval = card.interval;
    const now = new Date();

    if (quality === "hard") {
      newInterval = 1;
    } else if (quality === "good") {
      newInterval = card.interval * 2;
    } else if (quality === "easy") {
      newInterval = card.interval * 3;
    }

    const nextDate = new Date();
    nextDate.setDate(now.getDate() + newInterval);

    await updateDoc(doc(db, "cards", card.id), {
      interval: newInterval,
      nextReview: Timestamp.fromDate(nextDate)
    });

    if (currentCardIndex + 1 < cards.length) {
      setIsFlipped(false);
      // Delay aumentado para 600ms para garantir que a animação de desvirar terminou
      setTimeout(() => {
        setCurrentCardIndex(prev => prev + 1);
      }, 600);
    } else {
      setView("home");
      fetchStats();
      alert("Parabéns! Você concluiu suas revisões de hoje.");
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-indigo-100">
      {/* Header */}
      <header className="max-w-4xl mx-auto px-6 py-8 flex items-center justify-between">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView("home")}>
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <Brain size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">EchoCards</h1>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={openManage}
            className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
            title="Gerenciar Cartões"
          >
            <Settings size={20} />
          </button>
          <div className="text-sm font-medium px-3 py-1 bg-white border border-gray-200 rounded-full shadow-sm">
            {stats.due} pendentes
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 pb-20">
        <AnimatePresence mode="wait">
          {view === "home" && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid gap-6 md:grid-cols-2"
            >
              {/* Stats Card */}
              <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between">
                <div>
                  <h2 className="text-gray-500 text-sm font-semibold uppercase tracking-wider mb-1">Progresso Total</h2>
                  <p className="text-4xl font-bold">{stats.total} <span className="text-lg font-normal text-gray-400">cartões</span></p>
                </div>
                <div className="mt-8">
                  <button 
                    onClick={startReview}
                    disabled={stats.due === 0}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white rounded-2xl font-bold transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                  >
                    <Zap size={20} />
                    Estudar Agora ({stats.due})
                  </button>
                </div>
              </div>

              {/* Generate Trigger */}
              <div className="bg-indigo-50 p-8 rounded-3xl border border-indigo-100 flex flex-col justify-between">
                <div>
                  <h2 className="text-indigo-600 text-sm font-semibold uppercase tracking-wider mb-1">Novo Conteúdo</h2>
                  <p className="text-xl font-semibold text-indigo-900 leading-tight">Adicione novos cartões para o seu deck.</p>
                </div>
                <div className="mt-8 grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setView("manual")}
                    className="py-4 bg-white hover:bg-gray-50 text-indigo-600 border-2 border-indigo-100 rounded-2xl font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <Plus size={20} />
                    Manual
                  </button>
                  <button 
                    onClick={() => setView("generate")}
                    className="py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
                  >
                    <Sparkles size={20} />
                    Com IA
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {view === "manual" && (
            <motion.div 
              key="manual"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-xl mx-auto bg-white p-8 rounded-3xl border border-gray-100 shadow-xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                  <Plus size={20} />
                </div>
                <h2 className="text-2xl font-bold">Criar Cartão Manual</h2>
              </div>
              
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Frente (Inglês)</label>
                  <input 
                    type="text"
                    value={manualCard.front}
                    onChange={(e) => setManualCard({...manualCard, front: e.target.value})}
                    placeholder="Ex: Overwhelmed"
                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Verso (Tradução)</label>
                  <input 
                    type="text"
                    value={manualCard.back}
                    onChange={(e) => setManualCard({...manualCard, back: e.target.value})}
                    placeholder="Ex: Sobrecarregado"
                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Exemplo (Opcional)</label>
                  <textarea 
                    value={manualCard.example}
                    onChange={(e) => setManualCard({...manualCard, example: e.target.value})}
                    placeholder="Ex: I feel overwhelmed with so much work."
                    rows={3}
                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setView("home")}
                    className="flex-1 py-4 text-gray-500 font-bold hover:bg-gray-50 rounded-2xl transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={saveManualCard}
                    disabled={isSaving || !manualCard.front.trim() || !manualCard.back.trim()}
                    className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-2xl font-bold transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                  >
                    {isSaving ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                    Salvar Cartão
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {view === "generate" && (
            <motion.div 
              key="generate"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-xl mx-auto bg-white p-8 rounded-3xl border border-gray-100 shadow-xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                  <Sparkles size={20} />
                </div>
                <h2 className="text-2xl font-bold">O que vamos aprender?</h2>
              </div>
              <p className="text-gray-500 mb-6">Digite um tema (ex: "Viagens", "Entrevista de Emprego", "Culinária") e a IA criará 3 cartões para você.</p>
              
              <div className="space-y-4">
                <input 
                  type="text"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  placeholder="Ex: Phrasal Verbs comuns..."
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                />
                <div className="flex gap-3">
                  <button 
                    onClick={() => setView("home")}
                    className="flex-1 py-4 text-gray-500 font-bold hover:bg-gray-50 rounded-2xl transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={generateCards}
                    disabled={isGenerating || !theme.trim()}
                    className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-2xl font-bold transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="animate-spin" size={20} />
                        Gerando...
                      </>
                    ) : (
                      <>
                        <Sparkles size={20} />
                        Gerar Cartões
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {view === "manage" && (
            <motion.div 
              key="manage"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-3xl mx-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                    <Settings size={20} />
                  </div>
                  <h2 className="text-2xl font-bold">Gerenciar Cartões</h2>
                </div>
                <button 
                  onClick={() => setView("home")}
                  className="p-2 hover:bg-gray-100 rounded-full transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-4">
                {allCards.length === 0 ? (
                  <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                    <p className="text-gray-400">Você ainda não tem nenhum cartão.</p>
                  </div>
                ) : (
                  allCards.map((card) => (
                    <div key={card.id} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between group">
                      <div className="flex-1">
                        <h3 className="font-bold text-indigo-900">{card.front}</h3>
                        <p className="text-sm text-gray-500">{card.back}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                          <p className="text-[10px] text-gray-400 uppercase font-bold">Próxima Revisão</p>
                          <p className="text-xs font-medium text-gray-600">
                            {card.nextReview.toDate().toLocaleDateString()}
                          </p>
                        </div>
                        <button 
                          onClick={() => card.id && deleteCard(card.id)}
                          className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {view === "review" && cards.length > 0 && (
            <motion.div 
              key="review"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-2xl mx-auto"
            >
              <div className="mb-8 flex items-center justify-between text-sm text-gray-400 font-medium">
                <span>Cartão {currentCardIndex + 1} de {cards.length}</span>
                <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-600 transition-all duration-500" 
                    style={{ width: `${((currentCardIndex + 1) / cards.length) * 100}%` }}
                  />
                </div>
              </div>

              <div className="relative h-[400px] perspective-1000">
                <motion.div 
                  className={`w-full h-full relative transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}
                  animate={{ rotateY: isFlipped ? 180 : 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 20 }}
                >
                  {/* Front */}
                  <div className="absolute inset-0 backface-hidden bg-white rounded-[2rem] border-2 border-gray-100 shadow-xl flex flex-col items-center justify-center p-12 text-center">
                    <BookOpen className="text-indigo-200 mb-6" size={48} />
                    <h3 className="text-4xl font-bold text-indigo-900 mb-4">{cards[currentCardIndex].front}</h3>
                    <button 
                      onClick={() => setIsFlipped(true)}
                      className="mt-8 px-8 py-3 bg-indigo-50 text-indigo-600 rounded-full font-bold hover:bg-indigo-100 transition-all flex items-center gap-2"
                    >
                      Virar Cartão <RotateCcw size={16} />
                    </button>
                  </div>

                  {/* Back */}
                  <div className="absolute inset-0 backface-hidden rotate-y-180 bg-white rounded-[2rem] border-2 border-indigo-100 shadow-xl flex flex-col p-12 overflow-y-auto">
                    <div className="flex-1 flex flex-col items-center justify-center text-center">
                      <span className="text-indigo-600 font-bold text-sm uppercase tracking-widest mb-2">Tradução</span>
                      <h3 className="text-3xl font-bold text-gray-900 mb-8">{cards[currentCardIndex].back}</h3>
                      
                      <div className="w-full p-6 bg-indigo-50 rounded-2xl text-left">
                        <span className="text-indigo-400 font-bold text-xs uppercase block mb-2">Exemplo</span>
                        <p className="text-indigo-900 italic text-lg leading-relaxed">"{cards[currentCardIndex].example}"</p>
                      </div>
                    </div>
                    
                    <div className="mt-4 flex justify-center">
                      <button 
                        onClick={() => cards[currentCardIndex].id && deleteCard(cards[currentCardIndex].id, true)}
                        className="p-2 text-gray-300 hover:text-red-500 transition-all flex items-center gap-2 text-xs font-bold uppercase tracking-widest"
                      >
                        <Trash2 size={14} /> Excluir Cartão
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>

              {isFlipped && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-8 grid grid-cols-3 gap-4"
                >
                  <button 
                    onClick={() => handleReview("hard")}
                    className="group p-4 bg-white border border-red-100 hover:bg-red-50 rounded-2xl transition-all flex flex-col items-center gap-1"
                  >
                    <span className="text-red-500 font-bold">Errei</span>
                    <span className="text-[10px] text-gray-400 uppercase font-bold">Resetar</span>
                  </button>
                  <button 
                    onClick={() => handleReview("good")}
                    className="group p-4 bg-white border border-indigo-100 hover:bg-indigo-50 rounded-2xl transition-all flex flex-col items-center gap-1"
                  >
                    <span className="text-indigo-600 font-bold">Bom</span>
                    <span className="text-[10px] text-gray-400 uppercase font-bold">Dobrar</span>
                  </button>
                  <button 
                    onClick={() => handleReview("easy")}
                    className="group p-4 bg-white border border-emerald-100 hover:bg-emerald-50 rounded-2xl transition-all flex flex-col items-center gap-1"
                  >
                    <span className="text-emerald-600 font-bold">Fácil</span>
                    <span className="text-[10px] text-gray-400 uppercase font-bold">Triplicar</span>
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Branding */}
      <footer className="fixed bottom-0 left-0 right-0 p-6 flex justify-center pointer-events-none">
        <div className="bg-white/80 backdrop-blur-md px-4 py-2 rounded-full border border-gray-200 text-[10px] font-bold text-gray-400 uppercase tracking-widest pointer-events-auto">
          Powered by Gemini AI & Firebase
        </div>
      </footer>

      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  );
}
