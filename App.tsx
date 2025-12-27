
import React, { useState, useEffect } from 'react';
import { HeroCharacter, AnimationScene, SavedProject, AppTab } from './types';
import { GeminiService } from './services/geminiService';
import { StorageService } from './services/storageService';
import { VISUAL_STYLES } from './constants';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('production');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  // PROJECT STATE
  const [title, setTitle] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [visualStyle, setVisualStyle] = useState(VISUAL_STYLES[0]);
  const [language, setLanguage] = useState('Bahasa Melayu');
  const [sceneCount, setSceneCount] = useState(10);
  const [hero, setHero] = useState<HeroCharacter>({ 
    id: 'h1', name: 'Protagonist', images: [], description: '', isAnalyzing: false 
  });
  const [scenes, setScenes] = useState<AnimationScene[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [remakeId, setRemakeId] = useState<string | null>(null);
  const [remakePrompt, setRemakePrompt] = useState('');
  
  // API KEY STATE
  const [hasApiKey, setHasApiKey] = useState(false);

  // VIDEO LOADING STATE
  const [videoLoadingMsg, setVideoLoadingMsg] = useState<string | null>(null);

  const LANGUAGES = ["Bahasa Melayu", "Bahasa Inggeris", "Bahasa Indonesia"];
  const VEO_LOADING_MESSAGES = [
    "Merangka pergerakan kamera...",
    "Menghidupkan tekstur watak...",
    "Menstabilkan pencahayaan sinematik...",
    "Merender bingkai per saat...",
    "Menyusun aliran naratif visual...",
    "Hampir siap untuk ditonton..."
  ];

  useEffect(() => {
    StorageService.getActiveProject().then(active => {
      if (active) loadProject(active);
    });
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    try {
      // @ts-ignore
      const has = await window.aistudio.hasSelectedApiKey();
      setHasApiKey(has);
    } catch (e) {
      setHasApiKey(false);
    }
  };

  const handleOpenKeyPicker = async () => {
    try {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      // Assume success as per guidelines
      setHasApiKey(true);
      setStatus('Key Updated');
      setTimeout(() => setStatus(''), 2000);
    } catch (e) {
      setError("Gagal membuka dialog pemilihan kunci.");
    }
  };

  const loadProject = (p: SavedProject) => {
    setTitle(p.name);
    setSynopsis(p.synopsis);
    setVisualStyle(p.visualStyle || VISUAL_STYLES[0]);
    setLanguage(p.language || 'Bahasa Melayu');
    setHero(p.hero);
    setScenes(p.scenes);
    StorageService.setActiveProjectId(p.id);
    setActiveTab('story');
  };

  const handleDNAUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setHero(prev => ({ ...prev, isAnalyzing: true }));
    setStatus('DNA Analysis...');
    const newImages: string[] = [];
    for (const file of Array.from(files) as File[]) {
      const base64 = await new Promise<string>(r => {
        const reader = new FileReader();
        reader.onload = ev => r((ev.target?.result as string) || "");
        reader.readAsDataURL(file);
      });
      newImages.push(base64);
    }
    const updatedImages = [...hero.images, ...newImages].slice(0, 4);
    try {
      const desc = await GeminiService.analyzeHero(updatedImages);
      setHero({ ...hero, images: updatedImages, description: desc, isAnalyzing: false });
      setStatus('DNA Locked');
    } catch (e) {
      setHero(prev => ({ ...prev, isAnalyzing: false }));
      setError("DNA analysis failed.");
    } finally {
      setTimeout(() => setStatus(''), 2000);
    }
  };

  const generateFullManifest = async () => {
    if (!title || !synopsis || hero.images.length === 0) {
      setError("Sila isi Tajuk, Sinopsis & Karakter DNA.");
      return;
    }
    setIsGenerating(true);
    setStatus('Directing...');
    try {
      const manifest = await GeminiService.generateProductionManifest(title, synopsis, hero.description, visualStyle, sceneCount, language);
      const newScenes: AnimationScene[] = manifest.map(m => ({
        ...m,
        id: `sc-${m.sceneNumber}-${Date.now()}`,
        image: null,
        status: 'idle'
      }));
      setScenes(newScenes);
      setActiveTab('story');
      const proj: SavedProject = {
        id: Date.now().toString(),
        name: title,
        synopsis,
        date: new Date().toISOString(),
        hero: { ...hero, description: hero.description },
        visualStyle,
        language,
        scenes: newScenes
      };
      await StorageService.saveProject(proj);
      StorageService.setActiveProjectId(proj.id);
    } catch (e) {
      setError("Director AI gagal.");
    } finally {
      setIsGenerating(false);
      setStatus('');
    }
  };

  const generateSceneVisual = async (sceneId: string, instruction?: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;
    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, status: 'loading' } : s));
    setStatus(`Rendering Sc ${scene.sceneNumber}...`);
    try {
      const img = await GeminiService.generateSceneVisual(scene, hero.images, hero.description, visualStyle, instruction);
      updateScenesLocally(sceneId, { image: img, status: 'done', videoUrl: null });
      setRemakeId(null);
      setRemakePrompt('');
    } catch (e) {
      updateScenesLocally(sceneId, { status: 'error' });
      setError("Gagal jana imej.");
    } finally {
      setStatus('');
    }
  };

  const extendShot = async (sceneId: string) => {
    // Check for API Key first (Veo requirement)
    // @ts-ignore
    const hasKey = await window.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }

    const scene = scenes.find(s => s.id === sceneId);
    if (!scene || !scene.image) return;

    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, videoStatus: 'extending' } : s));
    
    let msgIdx = 0;
    setVideoLoadingMsg(VEO_LOADING_MESSAGES[0]);
    const interval = setInterval(() => {
      msgIdx = (msgIdx + 1) % VEO_LOADING_MESSAGES.length;
      setVideoLoadingMsg(VEO_LOADING_MESSAGES[msgIdx]);
    }, 4000);

    try {
      const videoUrl = await GeminiService.extendSceneToVideo(scene, hero.description);
      updateScenesLocally(sceneId, { videoUrl, videoStatus: 'done' });
    } catch (e: any) {
      if (e.message?.includes("Requested entity was not found")) {
        // @ts-ignore
        await window.aistudio.openSelectKey();
        setHasApiKey(true);
      }
      updateScenesLocally(sceneId, { videoStatus: 'error' });
      setError("Gagal extend shot. Sila cuba lagi.");
    } finally {
      clearInterval(interval);
      setVideoLoadingMsg(null);
    }
  };

  const updateScenesLocally = (sceneId: string, updates: Partial<AnimationScene>) => {
    setScenes(prev => {
      const updated = prev.map(s => s.id === sceneId ? { ...s, ...updates } : s);
      const currentActiveId = localStorage.getItem('thesign_active_id');
      if (currentActiveId) {
        const proj: SavedProject = {
          id: currentActiveId,
          name: title,
          synopsis,
          date: new Date().toISOString(),
          hero,
          visualStyle,
          language,
          scenes: updated as AnimationScene[]
        };
        StorageService.saveProject(proj);
      }
      return updated;
    });
  };

  const downloadImage = (base64: string, filename: string) => {
    const link = document.createElement('a');
    link.href = base64;
    link.download = `${filename}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setStatus('Copied!');
    setTimeout(() => setStatus(''), 2000);
  };

  return (
    <div className="h-screen bg-[#050505] text-zinc-300 flex flex-col font-sans overflow-hidden">
      {/* MOBILE HEADER */}
      <header className="h-14 border-b border-white/5 glass flex items-center justify-between px-5 shrink-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-[#ff8c00] rounded flex items-center justify-center text-black font-black text-[10px]">C</div>
          <h1 className="text-[10px] font-black tracking-widest uppercase text-white">Cinematic <span className="text-[#ff8c00]">Studio</span></h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-bold text-zinc-500 uppercase">{status}</span>
          <button 
            onClick={() => {
              if(confirm("Mulakan projek baru? Data semasa akan hilang.")) {
                setTitle(''); setSynopsis(''); setHero({ id: 'h1', name: 'Protagonist', images: [], description: '', isAnalyzing: false }); setScenes([]); setActiveTab('production');
                localStorage.removeItem('thesign_active_id');
              }
            }} 
            className="px-3 py-1 bg-white/5 text-zinc-400 rounded-full text-[9px] font-black uppercase border border-white/10"
          >
            New
          </button>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto pb-24 custom-scrollbar">
        
        {/* TAB: PRODUCTION (SETUP) */}
        {activeTab === 'production' && (
          <div className="p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4">
            
            {/* API KEY SECTION (USER REQUEST) */}
            <section className="space-y-3">
              <p className="text-sm font-medium text-white ml-1">Masukkan Google API Key</p>
              <button 
                onClick={handleOpenKeyPicker}
                className="w-full bg-[#0f0f11] border-2 border-red-500/80 rounded-2xl px-5 py-4 flex items-center justify-between group active:scale-[0.98] transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${hasApiKey ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`}></div>
                  <span className="text-sm font-mono text-zinc-400">
                    {hasApiKey ? "••••••••••••••••" : "Klik untuk pilih kunci..."}
                  </span>
                </div>
                <i className="fa-regular fa-eye text-zinc-500 group-hover:text-zinc-300 transition-colors text-lg"></i>
              </button>
              <p className="text-[9px] text-zinc-500 px-2 italic">
                * Kunci berbayar diperlukan untuk penjanaan Video Veo. 
                <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-[#ff8c00] ml-1 underline">Billing Info</a>
              </p>
            </section>

            <section className="space-y-4">
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Script Setup</p>
              <input 
                value={title} onChange={e => setTitle(e.target.value)}
                placeholder="Tajuk Cerita..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold text-white focus:border-[#ff8c00]/50 outline-none"
              />
              <textarea 
                value={synopsis} onChange={e => setSynopsis(e.target.value)}
                placeholder="Sinopsis ringkas..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-xs font-medium h-32 resize-none focus:border-[#ff8c00]/50 outline-none"
              />
            </section>

            <section className="space-y-4">
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Character DNA (Rujukan Muka)</p>
              <div className="grid grid-cols-4 gap-2">
                {hero.images.map((img, i) => (
                  <div key={i} className="aspect-square rounded-xl bg-white/5 border border-white/10 overflow-hidden relative">
                    <img src={img} className="w-full h-full object-cover" />
                    <button 
                      onClick={() => setHero({ ...hero, images: hero.images.filter((_, idx) => idx !== i) })}
                      className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-[10px] flex items-center justify-center"
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                ))}
                {hero.images.length < 4 && (
                  <label className="aspect-square rounded-xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center cursor-pointer active:bg-white/5">
                    <input type="file" multiple className="hidden" onChange={handleDNAUpload} accept="image/*" />
                    <i className="fa-solid fa-plus text-zinc-700"></i>
                  </label>
                )}
              </div>
              {hero.isAnalyzing && <p className="text-[9px] font-bold text-[#ff8c00] animate-pulse">ANALYZING DNA...</p>}
            </section>

            <section className="space-y-4">
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Director's Configuration</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[8px] font-black text-zinc-600 uppercase ml-2">Visual Style</span>
                  <select value={visualStyle} onChange={e => setVisualStyle(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-[11px] font-bold appearance-none">
                    {VISUAL_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <span className="text-[8px] font-black text-zinc-600 uppercase ml-2">Bahasa Utama</span>
                  <select value={language} onChange={e => setLanguage(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-[11px] font-bold appearance-none">
                    {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between px-2 bg-white/5 rounded-2xl p-4">
                <span className="text-[10px] font-black text-zinc-500 uppercase">Jumlah Babak</span>
                <div className="flex items-center gap-4">
                  <button onClick={() => setSceneCount(Math.max(1, sceneCount-1))} className="w-8 h-8 rounded-full bg-white/5 text-sm">-</button>
                  <span className="text-sm font-black text-[#ff8c00]">{sceneCount}</span>
                  <button onClick={() => setSceneCount(Math.min(20, sceneCount+1))} className="w-8 h-8 rounded-full bg-white/5 text-sm">+</button>
                </div>
              </div>
            </section>

            <button 
              onClick={generateFullManifest}
              disabled={isGenerating}
              className="w-full py-5 bg-[#ff8c00] text-black rounded-3xl font-black text-[11px] uppercase shadow-2xl active:scale-95 transition-all disabled:opacity-30"
            >
              {isGenerating ? 'Directing...' : 'Build Full Script'}
            </button>
          </div>
        )}

        {/* TAB: STUDIO (TIMELINE) */}
        {activeTab === 'story' && (
          <div className="p-4 space-y-6 animate-in fade-in">
            {scenes.length === 0 ? (
              <div className="py-20 text-center opacity-30">
                <i className="fa-solid fa-clapperboard text-4xl mb-4"></i>
                <p className="text-[10px] font-black uppercase tracking-widest">Tiada Babak. Bina skrip di tab "Plan".</p>
              </div>
            ) : (
              scenes.map((scene) => (
                <div key={scene.id} className="glass-card rounded-[28px] overflow-hidden border border-white/5 flex flex-col relative">
                  
                  {/* Image/Video Display */}
                  <div className="aspect-video bg-zinc-900 relative">
                    {scene.videoUrl ? (
                      <video 
                        src={scene.videoUrl} 
                        className="w-full h-full object-cover" 
                        autoPlay 
                        loop 
                        muted 
                        playsInline 
                      />
                    ) : scene.image ? (
                      <img src={scene.image} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center">
                        <button 
                          onClick={() => generateSceneVisual(scene.id)} 
                          disabled={scene.status === 'loading'}
                          className="w-14 h-14 bg-white rounded-full text-black shadow-xl active:scale-90 transition-all flex items-center justify-center"
                        >
                          {scene.status === 'loading' ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-camera"></i>}
                        </button>
                        <p className="text-[8px] font-black uppercase mt-3 text-zinc-600">Jana Frame</p>
                      </div>
                    )}

                    {/* Controls Overlay */}
                    {scene.image && !scene.videoUrl && (
                      <div className="absolute bottom-3 right-3 flex gap-2">
                         <button 
                          onClick={() => downloadImage(scene.image!, `${title}_scene_${scene.sceneNumber}`)}
                          className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white active:scale-90"
                         >
                          <i className="fa-solid fa-download"></i>
                         </button>
                         <button 
                          onClick={() => setRemakeId(scene.id)}
                          className="px-4 h-10 rounded-full bg-white/10 backdrop-blur-md text-white font-black text-[9px] uppercase border border-white/20 active:scale-90"
                         >
                          Remake
                         </button>
                         <button 
                          onClick={() => extendShot(scene.id)}
                          disabled={scene.videoStatus === 'extending'}
                          className="px-4 h-10 rounded-full bg-[#ff8c00] text-black font-black text-[9px] uppercase shadow-xl active:scale-90 flex items-center gap-2"
                         >
                          {scene.videoStatus === 'extending' ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-wand-magic-sparkles"></i>}
                          Extend Shot
                         </button>
                      </div>
                    )}
                    
                    {/* Scene Tag */}
                    <div className="absolute top-4 left-4 flex gap-1.5">
                      <div className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-[10px] font-black text-[#ff8c00]">
                        {scene.sceneNumber}
                      </div>
                    </div>

                    {/* Video Loading Overlay */}
                    {scene.videoStatus === 'extending' && (
                      <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-40 flex flex-col items-center justify-center p-8 text-center">
                        <div className="w-16 h-16 border-4 border-t-[#ff8c00] border-white/5 rounded-full animate-spin mb-6"></div>
                        <p className="text-white font-black text-xs uppercase tracking-widest mb-2">Generating Video AI</p>
                        <p className="text-zinc-500 text-[10px] font-medium animate-pulse">{videoLoadingMsg}</p>
                        <p className="mt-10 text-[8px] text-zinc-600 uppercase font-black">Sila kekal di halaman ini. Proses ini mungkin mengambil masa 1-2 minit.</p>
                      </div>
                    )}
                  </div>

                  {/* Remake Panel */}
                  {remakeId === scene.id && (
                    <div className="p-4 bg-[#ff8c00]/10 border-b border-[#ff8c00]/20 space-y-3 animate-in slide-in-from-top-2">
                       <p className="text-[9px] font-black text-[#ff8c00] uppercase">Remake Scene {scene.sceneNumber}</p>
                       <textarea 
                        value={remakePrompt}
                        onChange={(e) => setRemakePrompt(e.target.value)}
                        placeholder="Cth: Tukar waktu ke malam, tambahkan hujan..."
                        className="w-full bg-black/40 border border-[#ff8c00]/30 rounded-xl p-3 text-xs text-white h-20 resize-none outline-none focus:border-[#ff8c00]"
                       />
                       <div className="flex gap-2">
                         <button 
                          onClick={() => generateSceneVisual(scene.id, remakePrompt)}
                          className="flex-1 py-3 bg-[#ff8c00] text-black font-black text-[10px] uppercase rounded-xl"
                         >
                          Confirm Remake
                         </button>
                         <button 
                          onClick={() => setRemakeId(null)}
                          className="px-5 py-3 bg-white/5 text-zinc-400 font-black text-[10px] uppercase rounded-xl"
                         >
                          Cancel
                         </button>
                       </div>
                    </div>
                  )}

                  {/* Scene Data */}
                  <div className="p-5 space-y-4">
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-tight mb-1">{scene.title}</h3>
                      <p className="text-zinc-500 text-[10px] italic leading-relaxed">"{scene.visual}"</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 border-t border-white/5 pt-4">
                       <div className="space-y-1">
                          <p className="text-[7px] font-black text-[#ff8c00] uppercase">Action</p>
                          <p className="text-[10px] text-zinc-400 leading-tight">{scene.action}</p>
                       </div>
                       <div className="space-y-1">
                          <p className="text-[7px] font-black text-emerald-500 uppercase">Dialogue</p>
                          <p className="text-[10px] text-white italic">"{scene.dialogue}"</p>
                       </div>
                    </div>

                    <div className="bg-white/5 rounded-xl p-3">
                       <p className="text-[7px] font-black text-zinc-600 uppercase mb-1">Director Notes</p>
                       <p className="text-[9px] text-zinc-500 italic">{scene.cinematicNotes}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB: EXPORT */}
        {activeTab === 'export' && (
          <div className="p-6 space-y-6 animate-in fade-in">
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Production Metadata Export</p>
            {scenes.length === 0 ? (
               <div className="py-20 text-center opacity-30"><p className="text-xs uppercase font-black">Tiada data untuk dieksport</p></div>
            ) : (
              <div className="space-y-4">
                 {scenes.map(s => (
                   <div key={s.id} className="glass-card p-4 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black text-[#ff8c00] uppercase">Scene {s.sceneNumber} Prompt</span>
                        <button 
                          onClick={() => copyToClipboard(JSON.stringify({ visual: s.visual, technical: s.cinematicNotes }, null, 2))}
                          className="text-[10px] text-zinc-500 hover:text-white"
                        >
                          <i className="fa-solid fa-copy"></i>
                        </button>
                      </div>
                      <pre className="text-[9px] bg-black/40 p-3 rounded-xl overflow-x-auto text-emerald-500/80 custom-scrollbar font-mono">
                        {JSON.stringify({ 
                          visual: s.visual, 
                          action: s.action,
                          technical: s.cinematicNotes,
                          style: visualStyle
                        }, null, 2)}
                      </pre>
                   </div>
                 ))}
                 <button 
                  onClick={() => copyToClipboard(JSON.stringify(scenes.map(s => ({ scene: s.sceneNumber, visual: s.visual, dialogue: s.dialogue })), null, 2))}
                  className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase text-zinc-400 active:bg-white/10"
                 >
                  Copy Full Production JSON
                 </button>
              </div>
            )}
            
            <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
              <p className="text-[10px] font-black text-zinc-600 uppercase mb-2">Video Billing Info</p>
              <p className="text-[9px] text-zinc-500 leading-relaxed">
                Penjanaan video memerlukan API Key berbayar daripada projek Google Cloud. 
                Sila lawati <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-[#ff8c00] underline">dokumentasi billing</a> untuk maklumat lanjut.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* BOTTOM NAVIGATION */}
      <nav className="fixed bottom-0 left-0 right-0 h-20 glass border-t border-white/5 flex items-center justify-around px-4 pb-4 z-[100]">
        {[
          { id: 'production', label: 'Plan', icon: 'fa-pen-nib' },
          { id: 'story', label: 'Studio', icon: 'fa-film' },
          { id: 'export', label: 'Export', icon: 'fa-file-export' }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as AppTab)}
            className={`flex flex-col items-center gap-1 transition-all ${activeTab === tab.id ? 'text-[#ff8c00]' : 'text-zinc-600 opacity-60'}`}
          >
            <div className={`w-12 h-8 rounded-2xl flex items-center justify-center transition-all ${activeTab === tab.id ? 'bg-[#ff8c00]/10' : ''}`}>
              <i className={`fa-solid ${tab.icon} text-lg`}></i>
            </div>
            <span className="text-[8px] font-black uppercase tracking-widest">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* NOTIFICATION OVERLAY */}
      {error && (
        <div className="fixed top-16 left-4 right-4 z-[120] animate-in slide-in-from-top-4">
          <div className="bg-red-500 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between">
            <p className="text-[9px] font-black uppercase">{error}</p>
            <button onClick={() => setError(null)}><i className="fa-solid fa-xmark"></i></button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
