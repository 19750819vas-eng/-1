
import React, { useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import mammoth from "mammoth";
import { 
  FileText, 
  Upload, 
  X, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  FileSearch,
  Copy,
  Trash2,
  Sparkles
} from 'lucide-react';

// --- Utility Functions ---

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
  });
};

const fileToText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsText(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

const extractDocxText = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  } catch (err) {
    console.error("Ошибка при чтении Word файла:", err);
    throw new Error("Не удалось прочитать содержимое Word документа.");
  }
};

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

interface AppFile {
  file: File;
  base64: string;
  extractedText?: string;
  id: string;
}

// --- Main Component ---

const App = () => {
  const [files, setFiles] = useState<AppFile[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []) as File[];
    if (files.length + selectedFiles.length > 10) {
      setError('Можно загрузить не более 10 файлов одновременно.');
      return;
    }

    const newFiles: AppFile[] = [];
    for (const file of selectedFiles) {
      try {
        let base64 = '';
        let extractedText = undefined;

        // Если это Word или текст, извлекаем содержимое сразу
        if (file.name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          extractedText = await extractDocxText(file);
        } else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
          extractedText = await fileToText(file);
        } else {
          // Для картинок и PDF берем base64
          base64 = await fileToBase64(file);
        }

        newFiles.push({
          file,
          base64,
          extractedText,
          id: Math.random().toString(36).substring(7)
        });
      } catch (err: any) {
        console.error("Error reading file:", err);
        setError(`Ошибка при обработке файла ${file.name}: ${err.message}`);
      }
    }

    setFiles(prev => [...prev, ...newFiles]);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const clearAll = () => {
    setFiles([]);
    setResult('');
    setError(null);
  };

  const analyzeFiles = async () => {
    if (files.length === 0) return;
    
    setIsAnalyzing(true);
    setResult('');
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const promptParts: any[] = [];

      files.forEach(f => {
        if (f.extractedText) {
          // Отправляем как текст
          promptParts.push({ text: `Содержимое файла ${f.file.name}:\n${f.extractedText}` });
        } else if (f.base64) {
          // Отправляем как бинарные данные (для PDF и изображений)
          promptParts.push({
            inlineData: {
              mimeType: f.file.type || 'application/octet-stream',
              data: f.base64
            }
          });
        }
      });

      promptParts.push({
        text: "Проанализируй все предоставленные выше файлы (тексты, документы и изображения) и сделай краткие, но содержательные выводы по каждому из них. Выдели ключевые тезисы. В конце сделай общий обобщающий вывод. Отвечай на русском языке."
      });

      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3-flash-preview',
        contents: { parts: promptParts },
      });

      for await (const chunk of responseStream) {
        const c = chunk as GenerateContentResponse;
        const chunkText = c.text;
        if (chunkText) {
          setResult(prev => prev + chunkText);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Произошла ошибка при анализе файлов. Попробуйте снова.');
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(result);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <header className="mb-12 text-center">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-600 rounded-2xl mb-4 shadow-lg shadow-indigo-200">
            <FileSearch className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            AI Док-Аналитик
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Анализируйте документы Word, PDF, изображения и текст мгновенно.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-8">
          <section className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-600" />
                Загрузка файлов
              </h2>
              <span className="text-sm font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                {files.length} / 10
              </span>
            </div>

            <div 
              onClick={() => fileInputRef.current?.click()}
              className="group relative cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-12 text-center transition-all hover:border-indigo-400 hover:bg-indigo-50/30"
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                multiple 
                accept="image/*,.pdf,.txt,.doc,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              />
              <div className="flex flex-col items-center gap-3">
                <div className="p-4 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform">
                  <Upload className="w-8 h-8 text-slate-400 group-hover:text-indigo-600" />
                </div>
                <div>
                  <p className="text-base font-semibold text-slate-900">Нажмите для выбора файлов</p>
                  <p className="text-sm text-slate-500 mt-1">Изображения, PDF, Word, текст (до 10 шт.)</p>
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 animate-in fade-in slide-in-from-top-1">
                <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}

            {files.length > 0 && (
              <div className="mt-8 space-y-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Список файлов</span>
                  <button 
                    onClick={clearAll}
                    className="text-sm font-medium text-red-500 hover:text-red-600 flex items-center gap-1 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Очистить всё
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {files.map((f) => (
                    <div 
                      key={f.id} 
                      className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl group hover:border-indigo-200 hover:bg-white transition-all"
                    >
                      <div className="p-2 bg-white rounded-lg border border-slate-200 group-hover:bg-indigo-50">
                        {f.file.type.startsWith('image/') && f.base64 ? (
                           <img src={`data:${f.file.type};base64,${f.base64}`} alt="" className="w-8 h-8 object-cover rounded" />
                        ) : (
                          <FileText className="w-8 h-8 text-indigo-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{f.file.name}</p>
                        <p className="text-xs text-slate-400">{formatSize(f.file.size)}</p>
                      </div>
                      <button 
                        onClick={() => removeFile(f.id)}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  disabled={isAnalyzing}
                  onClick={analyzeFiles}
                  className="w-full mt-6 py-4 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-2xl font-bold shadow-lg shadow-indigo-100 flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Анализируем содержимое...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Получить выводы
                    </>
                  )}
                </button>
              </div>
            )}
          </section>

          {(result || isAnalyzing) && (
            <section className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  Результаты анализа
                </h2>
                {result && (
                  <button 
                    onClick={copyToClipboard}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all relative"
                    title="Копировать в буфер обмена"
                  >
                    {isCopied ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
                    {isCopied && (
                      <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] bg-slate-800 text-white px-2 py-1 rounded">Скопировано!</span>
                    )}
                  </button>
                )}
              </div>
              <div className="prose prose-slate max-w-none">
                <div className="whitespace-pre-wrap text-slate-700 leading-relaxed min-h-[100px] relative">
                  {result}
                  {isAnalyzing && !result && (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
                      <Loader2 className="w-10 h-10 animate-spin text-indigo-400" />
                      <p>ИИ изучает документы...</p>
                    </div>
                  )}
                  {isAnalyzing && result && (
                     <span className="inline-block w-2 h-4 ml-1 bg-indigo-400 animate-pulse align-middle" />
                  )}
                </div>
              </div>
            </section>
          )}
        </div>

        <footer className="mt-16 text-center text-slate-400 text-sm">
          <p>© {new Date().getFullYear()} Аналитический помощник. Обработка Word, PDF и фото.</p>
        </footer>
      </div>
    </div>
  );
};

// --- Render ---
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
