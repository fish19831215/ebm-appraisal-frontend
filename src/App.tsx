import { useState, useRef, useEffect } from 'react';
import './index.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://127.0.0.1:8000' 
    : 'https://ebmbackend.zeabur.app'
);

interface Article {
  id: string;
  title: string;
  authors: string;
  year: string;
  abstract: string;
  link: string;
  pub_type?: string;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

function App() {
  const [currentStep, setCurrentStep] = useState(1);
  
  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'model', text: '您好！我是您的實證醫學助理。請問您今天想要探討怎樣的臨床情境或案例呢？請盡量提供具體的病人特徵、您想考慮的處置或藥物，以及預期的治療結果。' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [isExtractingPico, setIsExtractingPico] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // PICO State
  const [pico, setPico] = useState({ p: '', i: '', c: '', o: '' });
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<Article[]>([]);
  const [selectedArticles, setSelectedArticles] = useState<Article[]>([]);
  const [yearLimit, setYearLimit] = useState<number>(5);
  const [limitToTopJournals, setLimitToTopJournals] = useState<boolean>(false);
  const [suggestedStrategy, setSuggestedStrategy] = useState('');
  const [isModifyingStrategy, setIsModifyingStrategy] = useState(false);

  // Appraisal State
  const [appraisalHtml, setAppraisalHtml] = useState<string>('');
  const [isAppraising, setIsAppraising] = useState(false);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim()) return;

    const newMessages: ChatMessage[] = [...chatMessages, { role: 'user', text: chatInput }];
    setChatMessages(newMessages);
    setChatInput('');
    setIsChatting(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      });
      const data = await res.json();
      setChatMessages([...newMessages, { role: 'model', text: data.response }]);
    } catch (e: any) {
      alert("無法連線到後端 API: " + e.message);
    } finally {
      setIsChatting(false);
    }
  };

  const handleExtractPico = async () => {
    setIsExtractingPico(true);
    setPico({ p: '正在萃取...', i: '正在萃取...', c: '正在萃取...', o: '正在萃取...' });
    setCurrentStep(2);

    try {
      const res = await fetch(`${API_BASE_URL}/api/extract-pico`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatMessages })
      });
      const data = await res.json();
      setPico({ p: data.p || '', i: data.i || '', c: data.c || '', o: data.o || '' });
    } catch (e: any) {
      alert("PICO 萃取失敗: " + e.message);
      setPico({ p: '', i: '', c: '', o: '' });
    } finally {
      setIsExtractingPico(false);
    }
  };

  const handlePicoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery("正在產生搜尋策略...");
    setCurrentStep(3);

    try {
      const res = await fetch(`${API_BASE_URL}/api/search-strategy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pico)
      });
      const data = await res.json();
      setSearchQuery(data.query);
    } catch (e: any) {
      alert("無法連線到後端 API: " + e.message);
      setSearchQuery("");
    }
  };

  const performSearch = async (queryToUse: string = searchQuery) => {
    setIsSearching(true);
    setCurrentStep(4);
    setResults([]);
    setSelectedArticles([]);
    setSuggestedStrategy('');

    let finalQuery = queryToUse;
    if (limitToTopJournals) {
      finalQuery = `(${finalQuery}) AND ("New England Journal of Medicine"[Journal] OR "JAMA"[Journal] OR "Cochrane Database Syst Rev"[Journal])`;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: finalQuery, 
          max_results: 15,
          year_limit: yearLimit 
        })
      });
      const data = await res.json();
      const newResults = data.results || [];
      setResults(newResults);

      if (newResults.length === 0 && queryToUse) {
        setIsModifyingStrategy(true);
        try {
          const modRes = await fetch(`${API_BASE_URL}/api/auto-modify-strategy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ original_query: queryToUse })
          });
          const modData = await modRes.json();
          if (modData.new_query && modData.new_query !== queryToUse) {
            setSuggestedStrategy(modData.new_query);
          }
        } catch (modErr) {
          console.error(modErr);
        } finally {
          setIsModifyingStrategy(false);
        }
      }

    } catch (e: any) {
      alert("搜尋失敗: " + e.message);
    } finally {
      setIsSearching(false);
    }
  };

  const applySuggestedStrategy = () => {
    setSearchQuery(suggestedStrategy);
    performSearch(suggestedStrategy);
  };

  const toggleArticleSelection = (article: Article) => {
    if (selectedArticles.some(a => a.id === article.id)) {
      setSelectedArticles(selectedArticles.filter(a => a.id !== article.id));
    } else {
      setSelectedArticles([...selectedArticles, article]);
    }
  };

  const generateReport = async () => {
    if (selectedArticles.length === 0) {
      alert("請至少選擇一篇文獻進行分析");
      return;
    }
    setCurrentStep(5);
    setIsAppraising(true);
    setAppraisalHtml('');

    try {
      const res = await fetch(`${API_BASE_URL}/api/generate-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pico_query: searchQuery,
          articles: selectedArticles
        })
      });
      const data = await res.json();
      setAppraisalHtml(data.report_html);
    } catch (e: any) {
      setAppraisalHtml(`<p style="color: red;">生成報告失敗: ${e.message}</p>`);
    } finally {
      setIsAppraising(false);
    }
  };

  const downloadReport = () => {
    if (!appraisalHtml) return;
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>EBM 綜合實證分析報告</title>
        <style>
          body { font-family: sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
          h1, h2, h3 { color: #2c3e50; }
          .ebm-report { background: #f8f9fa; padding: 20px; border-radius: 8px; border: 1px solid #e9ecef; }
        </style>
      </head>
      <body>
        <h1>EBM 綜合實證分析報告</h1>
        <p><strong>產出時間：</strong> ${new Date().toLocaleString()}</p>
        <p><strong>搜尋策略：</strong> ${searchQuery}</p>
        <hr/>
        ${appraisalHtml}
      </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `EBM-Comprehensive-Report.html`;
    a.click();
  };

  const exportToCSV = () => {
    if (selectedArticles.length === 0) {
      alert("請先選擇至少一篇文獻");
      return;
    }
    
    const headers = ['PMID', 'Title', 'Authors', 'Year', 'Link', 'Abstract'];
    const rows = selectedArticles.map(a => {
      const escapeCsv = (str: string) => `"${str.replace(/"/g, '""')}"`;
      return [
        a.id,
        escapeCsv(a.title),
        escapeCsv(a.authors),
        a.year,
        escapeCsv(a.link),
        escapeCsv(a.abstract)
      ].join(',');
    });
    
    const csvContent = [headers.join(','), ...rows].join('\n');
    // Add UTF-8 BOM so Excel opens it correctly
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'ebm_selected_articles.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div id="app">
      <header className="app-header">
        <h1>EBM Appraisal Tool</h1>
        <p>實證醫學自動化評讀助手</p>
      </header>

      <main className="wizard-container">
        {/* Stepper */}
        <div className="stepper">
          <div className={`step ${currentStep >= 1 ? 'active' : ''}`} onClick={() => setCurrentStep(1)}>1. 臨床討論</div>
          <div className={`step ${currentStep >= 2 ? 'active' : ''}`} onClick={() => setCurrentStep(2)}>2. PICO 設定</div>
          <div className={`step ${currentStep >= 3 ? 'active' : ''}`} onClick={() => setCurrentStep(3)}>3. 搜尋策略</div>
          <div className={`step ${currentStep >= 4 ? 'active' : ''}`} onClick={() => setCurrentStep(4)}>4. 搜尋文獻</div>
          <div className={`step ${currentStep >= 5 ? 'active' : ''}`} onClick={() => setCurrentStep(5)}>5. 評讀報告</div>
        </div>

        {/* Step 1: Chat Discussion */}
        {currentStep === 1 && (
          <section className="step-content active fade-in">
            <h2>臨床問題討論</h2>
            <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
              請用語音或文字與 AI 助理討論您的臨床情境，系統將協助您梳理成結構化的 PICO 問題。
            </p>
            
            <div className="chat-container">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`chat-message ${msg.role}`}>
                  {msg.text}
                </div>
              ))}
              {isChatting && (
                <div className="chat-message model">
                  <span className="loading-text">正在回覆...</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form className="chat-input-area" onSubmit={handleSendMessage}>
              <input 
                type="text" 
                value={chatInput} 
                onChange={e => setChatInput(e.target.value)} 
                placeholder="輸入您的回覆..." 
                disabled={isChatting}
              />
              <button type="submit" className="primary-btn-sm" disabled={isChatting || !chatInput.trim()}>
                送出
              </button>
            </form>

            <div className="button-group" style={{ marginTop: '2rem' }}>
              <button 
                className="primary-btn" 
                onClick={handleExtractPico} 
                disabled={chatMessages.length <= 1 || isChatting}
                style={{ width: '100%' }}
              >
                討論差不多了，由 AI 自動抽出 PICO
              </button>
            </div>
            <div className="button-group" style={{ marginTop: '1rem' }}>
              <button className="secondary-btn" onClick={() => setCurrentStep(2)} style={{ width: '100%' }}>
                或者，直接手動輸入 PICO
              </button>
            </div>
          </section>
        )}

        {/* Step 2: PICO Input/Edit */}
        {currentStep === 2 && (
          <section className="step-content active fade-in">
            <h2>確認實證提問 (PICO)</h2>
            <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
              以下是萃取出的 PICO 要素，您可以自由修改成最合適的關鍵字。
            </p>
            {isExtractingPico ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <p className="loading-text">AI 正在從對話中為您梳理 PICO...</p>
              </div>
            ) : (
              <form onSubmit={handlePicoSubmit}>
                <div className="form-group">
                  <label>Patient/Population (病人/族群)</label>
                  <input type="text" value={pico.p} onChange={(e) => setPico({...pico, p: e.target.value})} placeholder="例如：Type 2 Diabetes, Elderly" />
                </div>
                <div className="form-group">
                  <label>Intervention (介入/處置)</label>
                  <input type="text" value={pico.i} onChange={(e) => setPico({...pico, i: e.target.value})} placeholder="例如：Metformin" />
                </div>
                <div className="form-group">
                  <label>Comparison (比較/對照)</label>
                  <input type="text" value={pico.c} onChange={(e) => setPico({...pico, c: e.target.value})} placeholder="例如：Placebo or No treatment" />
                </div>
                <div className="form-group">
                  <label>Outcome (預期結果)</label>
                  <input type="text" value={pico.o} onChange={(e) => setPico({...pico, o: e.target.value})} placeholder="例如：Mortality, HbA1c reduction" />
                </div>
                <div className="button-group">
                  <button type="button" className="secondary-btn" onClick={() => setCurrentStep(1)}>回上一步討論</button>
                  <button type="submit" className="primary-btn">產生搜尋關鍵字</button>
                </div>
              </form>
            )}
          </section>
        )}

        {/* Step 3: Search Strategy */}
        {currentStep === 3 && (
          <section className="step-content active fade-in">
            <h2>搜尋策略檢視與修改</h2>
            <div className="search-strategy-builder">
              <h3>PubMed 搜尋字串</h3>
              <textarea rows={5} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}></textarea>
              
              <div className="filter-options" style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input 
                    type="checkbox" 
                    id="yearFilter" 
                    checked={yearLimit === 5} 
                    onChange={(e) => setYearLimit(e.target.checked ? 5 : 0)} 
                  />
                  <label htmlFor="yearFilter">僅搜尋近 5 年內的文獻 (Limit to last 5 years)</label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input 
                    type="checkbox" 
                    id="journalFilter" 
                    checked={limitToTopJournals} 
                    onChange={(e) => setLimitToTopJournals(e.target.checked)} 
                  />
                  <label htmlFor="journalFilter">🌟 頂尖實證過濾：僅顯示 NEJM、JAMA、Cochrane 等權威醫學期刊</label>
                </div>
              </div>
            </div>
            <div className="button-group">
              <button className="secondary-btn" onClick={() => setCurrentStep(2)}>上一步</button>
              <button className="primary-btn" onClick={() => performSearch()}>開始搜尋文獻</button>
            </div>
          </section>
        )}

        {/* Step 4: Search Results */}
        {currentStep === 4 && (
          <section className="step-content active fade-in">
            <h2>文獻搜尋結果</h2>
            
            {isSearching ? (
              <p className="loading-text" style={{ padding: '2rem', textAlign: 'center' }}>PubMed 搜尋中，請稍候...</p>
            ) : (
              <>
                {results.length === 0 ? (
                  <div style={{ padding: '1rem 0' }}>
                    <p style={{ marginBottom: '1rem' }}>找不到符合的文獻。</p>
                    {isModifyingStrategy ? (
                      <p className="loading-text">AI 正在分析並嘗試放寬搜尋策略...</p>
                    ) : suggestedStrategy ? (
                      <div className="warning-alert">
                        <strong>建議放寬搜尋條件：</strong>
                        <p style={{ margin: '0.5rem 0' }}>原搜尋策略似乎太過嚴格。您可以嘗試退回上一步修改，或是使用以下建議的放寬策略：</p>
                        <textarea readOnly value={suggestedStrategy} rows={3} style={{ width: '100%', marginTop: '0.5rem', marginBottom: '0.5rem', backgroundColor: '#fff' }} />
                        <button className="primary-btn-sm" onClick={applySuggestedStrategy}>套用新策略並重新搜尋</button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="results-list" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {['Systematic Review / Meta-Analysis', 'Guidelines', 'RCT', 'Clinical Trial', 'Review', 'Other'].map(category => {
                      const categoryResults = results.filter(r => (r.pub_type === category) || (!r.pub_type && category === 'Other'));
                      if (categoryResults.length === 0) return null;
                      
                      return (
                        <div key={category} className="result-category-group">
                          <h3 style={{ borderBottom: '2px solid var(--primary-color)', paddingBottom: '0.5rem', marginBottom: '1rem', color: 'var(--primary-dark)' }}>
                            {category === 'Systematic Review / Meta-Analysis' ? '🏆 系統性回顧 / 統合分析' :
                             category === 'Guidelines' ? '📜 臨床指引' :
                             category === 'RCT' ? '🏅 隨機對照試驗 (RCT)' :
                             category === 'Clinical Trial' ? '📘 臨床試驗' :
                             category === 'Review' ? '📖 文獻回顧' : '📄 其他觀察性研究'}
                            <span style={{ fontSize: '0.8rem', fontWeight: 'normal', marginLeft: '10px', color: '#666' }}>({categoryResults.length} 篇)</span>
                          </h3>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {categoryResults.map((res) => (
                              <div key={res.id} className="article-card" style={{ display: 'flex', gap: '15px', borderLeft: `4px solid ${category === 'Systematic Review / Meta-Analysis' || category === 'RCT' ? 'var(--primary-color)' : '#ccc'}` }}>
                                <div className="article-checkbox">
                                  <input 
                                    type="checkbox" 
                                    style={{ width: '20px', height: '20px', cursor: 'pointer', marginTop: '5px' }}
                                    checked={selectedArticles.some(a => a.id === res.id)}
                                    onChange={() => toggleArticleSelection(res)}
                                  />
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div className="article-title" style={{ fontSize: '1.1rem', fontWeight: '600', color: '#2c3e50', marginBottom: '4px' }}>
                                    {res.title} ({res.year})
                                  </div>
                                  <div className="article-authors" style={{ fontSize: '0.9rem', color: '#555', marginBottom: '8px' }}>{res.authors}</div>
                                  <div className="article-abstract" style={{ fontSize: '0.95rem', color: '#444', lineHeight: '1.5' }}>{res.abstract}</div>
                                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                    <button className="secondary-btn-sm" onClick={() => window.open(res.link, '_blank')}>開啟 PubMed全文</button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {results.length > 0 && (
                  <div className="selection-summary" style={{ background: 'var(--card-bg)', padding: '15px', borderRadius: '8px', marginTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                    <span>已選擇 <strong>{selectedArticles.length}</strong> 篇文獻進行分析</span>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button className="secondary-btn" onClick={exportToCSV} disabled={selectedArticles.length === 0}>
                        下載已選文獻 (CSV)
                      </button>
                      <button className="primary-btn" onClick={generateReport} disabled={selectedArticles.length === 0}>
                        產生綜合實證評讀報告
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="button-group" style={{ marginTop: '15px' }}>
              <button className="secondary-btn" onClick={() => setCurrentStep(3)} disabled={isSearching}>上一步</button>
            </div>
          </section>
        )}

        {/* Step 5: Appraisal & Report */}
        {currentStep === 5 && (
          <section className="step-content active fade-in">
            <h2>綜合實證分析報告 (EBM Report)</h2>
            <div className="selected-info" style={{ marginBottom: '1rem' }}>
              <p>共納入 <strong>{selectedArticles.length}</strong> 篇文獻進行綜合評讀分析。</p>
            </div>
            
            <div className="appraisal-content">
              {isAppraising ? (
                <div className="loading-container" style={{ textAlign: 'center', padding: '2rem' }}>
                  <p className="loading-text">AI 專家正在仔細閱讀並綜合分析 {selectedArticles.length} 篇文獻...</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>這可能需要 15~30 秒，請耐心等候。</p>
                </div>
              ) : (
                <div dangerouslySetInnerHTML={{ __html: appraisalHtml }} />
              )}
            </div>

            <div className="button-group">
              <button className="secondary-btn" onClick={() => setCurrentStep(4)}>上一步</button>
              <button className="primary-btn" onClick={downloadReport} disabled={isAppraising}>下載完整報告</button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
