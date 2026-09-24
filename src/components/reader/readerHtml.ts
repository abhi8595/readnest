import type { FocusMode, ReaderTheme } from '@/theme/tokens';

/**
 * Self-contained reader HTML for the WebView (EPUB/TXT/FB2/DOCX/ODT/MOBI-text).
 * No network needed: styles, fonts (@font-face data URIs) + bridge inlined.
 *
 * Bridge messages (window.ReactNativeWebView.postMessage, JSON):
 *  → {type:'pos', progress, chapterId, chapterLabel}
 *  → {type:'link', href}            internal navigation
 *  → {type:'select', text}          selection menu trigger
 *  → {type:'tap'}                   quick tap (toggle chrome)
 *  ← {type:'goto', chapterId|ratio}  navigate
 *  ← {type:'pageDelta', d}           turn pages in paginated mode
 *  ← {type:'theme', ...}             live theme update
 *  ← {type:'ttsMark', pIndex}        sentence highlight
 *  ← {type:'focus', mode}            D1 focus mode switch
 *  ← {type:'focusStep', d}           D1 move focus ±1 unit
 *  ← {type:'bionic', on}             D2 syllable-bolding toggle
 *  ← {type:'tint', overlay}          D2 Irlen wash overlay
 *  ← {type:'bilingual', items}       E2 accordion translations [{pIndex,text}]
 *  ← {type:'bilingualClear'}         E2 remove translations
 *
 * Paginated mode: CSS multicol + JS pager. Gestures:
 *  - horizontal swipe → prev/next page (native-feeling, 220ms ease)
 *  - tap left 22% → prev page, right 22% → next page, center → 'tap'
 * Scroll mode: tap anywhere → 'tap'. Long-press selection untouched.
 */

export interface ReaderHtmlOpts {
  theme: ReaderTheme;
  fontFamily: string;
  /** @font-face CSS with data-URI fonts (WebView can't see app-loaded fonts) */
  fontFaceCss?: string;
  fontSize: number;
  fontWeight: number;
  lineSpacing: number;
  marginPx: number;
  hyphenation: boolean;
  paginated: boolean;
  chapters: { id: string; label: string; html: string }[];
  startChapterId?: string | null;
  startRatio?: number;
  /** BCP-47 book language (dc:language / metadata) for <html lang>. */
  lang?: string | null;
  /** Right-to-left layout (Arabic, Hebrew, Persian, Urdu, …). */
  rtl?: boolean;
  /** D1 focus reading: dim all but the active sentence/paragraph. */
  focusMode?: FocusMode;
  /** D2 bionic-style first-syllable bolding (runtime text-node walk). */
  bionic?: boolean;
  /** D2 Irlen wash overlay color (CSS color incl. alpha) or null. */
  tintOverlay?: string | null;
}

/** Language codes that read right-to-left (prefix match before -/_). */
export function isRtlLang(lang: string | null | undefined): boolean {
  if (!lang) return false;
  const base = lang.toLowerCase().split(/[-_]/)[0];
  return base === 'ar' || base === 'he' || base === 'fa' || base === 'ur' ||
    base === 'ps' || base === 'sd' || base === 'yi' || base === 'ug' ||
    base === 'dv' || base === 'iw';
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function buildReaderHtml(o: ReaderHtmlOpts): string {
  const rtl = o.rtl ?? isRtlLang(o.lang);
  const langAttr = o.lang ? ` lang="${escAttr(o.lang)}"` : '';
  const focusMode = o.focusMode ?? 'off';
  const bionicOn = o.bionic ?? false;
  const tint = o.tintOverlay ?? null;
  const isEink = o.theme.id === 'eink';
  const chaptersHtml = o.chapters
    .map(
      (c, i) =>
        `<section class="chap" id="${c.id}" data-label="${escAttr(c.label)}" data-index="${i}">` +
        `<div class="kick">${escAttr(c.label)}</div>${c.html}</section>` +
        (i < o.chapters.length - 1 ? '<hr class="chapbreak"/>' : ''),
    )
    .join('');

  return `<!DOCTYPE html><html${langAttr}${rtl ? ' dir="rtl"' : ''}><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>${o.fontFaceCss ?? ''}</style>
<style>
:root{
  --bg:${o.theme.bg}; --fg:${o.theme.text}; --muted:${o.theme.muted}; --acc:${o.theme.accent};
  --fs:${o.fontSize}px; --lh:${o.lineSpacing}; --mx:${o.marginPx}px;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--bg);color:var(--fg);}
body{
  font-family:${o.fontFamily}; font-size:var(--fs); line-height:var(--lh);
  padding:24px var(--mx) 120px var(--mx);
  ${o.hyphenation ? '-webkit-hyphens:auto;hyphens:auto;' : ''}
  word-wrap:break-word; max-width:680px; margin:0 auto;
  -webkit-tap-highlight-color:transparent;
  ${rtl ? 'direction:rtl;' : ''}
}
${o.paginated
  ? `body{column-width:calc(100vw - var(--mx)*2 - 8px);column-gap:calc(var(--mx)*2 + 8px);height:calc(100dvh - 150px);overflow:hidden;}
     html{overflow:hidden;}`
  : ``}
.kick{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;font-size:11px;font-weight:800;
  letter-spacing:2.4px;color:var(--acc);margin:0 0 10px;text-transform:uppercase}
h1,h2,h3{line-height:1.25;margin:1.1em 0 .6em;color:var(--fg)}
.chap>p:first-of-type::first-letter{font-size:3.3em;float:left;line-height:.88;
  padding:5px 10px 0 0;font-weight:700;color:var(--fg)}
p{margin:.72em 0;text-align:${o.hyphenation ? 'justify' : 'left'}}
a{color:var(--acc)}
img{max-width:100%;height:auto;border-radius:8px}
table{border-collapse:collapse;display:block;overflow-x:auto;max-width:100%;margin:1em 0;font-size:.92em}
th,td{border:1px solid var(--muted);padding:.4em .6em;text-align:start;vertical-align:top}
pre{white-space:pre-wrap;word-break:break-word;background:var(--bg);border:1px solid var(--muted);border-radius:8px;padding:1em;overflow-x:auto;font-size:.88em}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.88em;word-break:break-word}
figure{margin:1em 0;max-width:100%}
figcaption{font-size:.82em;color:var(--muted);margin-top:.4em}
video,audio,iframe,object,embed,svg{max-width:100%}
dl,ul,ol{margin:.72em 0;padding-inline-start:1.4em}
li{margin:.3em 0}
hr.chapbreak{border:none;border-top:1px solid var(--muted);opacity:.4;margin:2em 20%}
blockquote{margin:1em 0;padding:.2em 0 .2em 1em;border-left:3px solid var(--acc);color:var(--muted)}
.tts-active{background:rgba(200,98,58,.22);background:color-mix(in srgb, var(--acc) 25%, transparent);border-radius:3px}
::selection{background:rgba(200,98,58,.30);background:color-mix(in srgb, var(--acc) 35%, transparent)}
${isEink ? `*{animation:none!important;transition:none!important;scroll-behavior:auto!important}` : ``}
/* D1 focus reading: dim everything except the active unit */
body[data-focus="paragraph"] p, body[data-focus="paragraph"] li, body[data-focus="sentence"] .fsent{opacity:.18;transition:opacity .18s ease}
body[data-focus="paragraph"] .focus-active, body[data-focus="sentence"] .focus-active{opacity:1!important}
/* D2 bionic-style syllable bolding */
.bio-b{font-weight:700}
/* D2 Irlen wash overlay */
#tintwash{position:fixed;inset:0;pointer-events:none;z-index:9999;display:${tint ? 'block' : 'none'};background:${tint ?? 'transparent'}}
/* E2 bilingual accordion: translation tucked under its paragraph */
.trans{font-size:.92em;color:var(--muted);border-left:3px solid var(--acc);padding:.15em 0 .15em .8em;margin:-.2em 0 .72em;opacity:.95}
</style></head><body${focusMode !== 'off' ? ` data-focus="${focusMode}"` : ''}>
<div id="tintwash"></div>
${chaptersHtml}
<script>
(function(){
  var RN = window.ReactNativeWebView;
  var post = function(m){ RN && RN.postMessage(JSON.stringify(m)); };
  var PAGINATED = ${o.paginated ? 'true' : 'false'};
  var RTL = ${rtl ? 'true' : 'false'};
  var EINK = ${isEink ? 'true' : 'false'};
  var FOCUS = ${JSON.stringify(focusMode)};
  var BIONIC = ${bionicOn ? 'true' : 'false'};
  var focusIdx = 0;
  var startId = ${JSON.stringify(o.startChapterId ?? null)};
  var startRatio = ${typeof o.startRatio === 'number' ? o.startRatio : 0};
  function pageW(){ return window.innerWidth; }
  function maxScrollX(){ return Math.max(1, document.documentElement.scrollWidth - window.innerWidth); }
  function maxScrollY(){ return Math.max(1, document.documentElement.scrollHeight - window.innerHeight); }
  function curPage(){ return Math.round(window.scrollX / pageW()); }
  function goPage(p){
    p = Math.max(0, p);
    window.scrollTo({left: p * pageW(), top: 0, behavior: EINK ? 'auto' : 'smooth'});
    setTimeout(report, EINK ? 60 : 260);
  }
  function currentChapter(){
    var secs = Array.prototype.slice.call(document.querySelectorAll('.chap'));
    if(!secs.length) return null;
    var probe = PAGINATED ? window.scrollX + window.innerWidth*0.4 : window.scrollY + window.innerHeight*0.3;
    var cur = secs[0];
    for (var i=0;i<secs.length;i++){
      var off = PAGINATED ? secs[i].offsetLeft : secs[i].offsetTop;
      if (off <= probe) cur = secs[i];
    }
    return cur;
  }
  function report(){
    var p = PAGINATED ? (window.scrollX / maxScrollX()) : (window.scrollY / maxScrollY());
    var c = currentChapter();
    post({type:'pos', progress: Math.min(1, Math.max(0, p||0)),
      chapterId: c?c.id:null, chapterLabel: c?c.dataset.label:null});
  }
  var t=null;
  window.addEventListener('scroll', function(){ if(t)clearTimeout(t); t=setTimeout(report, 120); }, {passive:true});
  document.addEventListener('click', function(e){
    var a = e.target.closest ? e.target.closest('a[href]') : null;
    if (a){ e.preventDefault(); post({type:'link', href:a.getAttribute('href')}); }
  });
  document.addEventListener('selectionchange', function(){
    var s = window.getSelection ? window.getSelection().toString().trim() : '';
    if (s && s.length>1) post({type:'select', text:s.slice(0,2000)});
  });
  // ── gestures: swipe paging + tap zones (paginated) / tap (scroll) ──
  var tsX=0, tsY=0, tsT=0;
  document.addEventListener('touchstart', function(e){
    if(e.touches.length!==1) return;
    tsX=e.touches[0].clientX; tsY=e.touches[0].clientY; tsT=Date.now();
  }, {passive:true});
  document.addEventListener('touchend', function(e){
    if(e.changedTouches.length!==1) return;
    var dx=e.changedTouches[0].clientX-tsX, dy=e.changedTouches[0].clientY-tsY, dt=Date.now()-tsT;
    if(PAGINATED && Math.abs(dx)>48 && Math.abs(dx)>Math.abs(dy)*1.2){
      // RTL mirrors horizontal navigation: swipe-left goes back.
      var dir = (dx<0?1:-1) * (RTL?-1:1);
      goPage(curPage() + dir);
      return;
    }
    if(dt<400 && Math.hypot(dx,dy)<14){
      var el = document.elementFromPoint(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      if(el && el.closest && el.closest('a[href]')) return; // link click handles it
      var x = e.changedTouches[0].clientX, w = window.innerWidth;
      var prevZone = RTL ? x > w*0.78 : x < w*0.22;
      var nextZone = RTL ? x < w*0.22 : x > w*0.78;
      if(PAGINATED && prevZone){ goPage(curPage()-1); return; }
      if(PAGINATED && nextZone){ goPage(curPage()+1); return; }
      post({type:'tap'});
    }
  }, {passive:true});
  document.addEventListener('message', onMsg); window.addEventListener('message', onMsg);
  // ── D1 focus reading: sentence/paragraph units, manual step-through ──
  var focusUnits = [];
  function clearFocus(){
    document.querySelectorAll('.focus-active').forEach(function(n){n.classList.remove('focus-active')});
    focusUnits = []; focusIdx = 0;
  }
  function collectTextNodes(root){
    var out = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var n; while((n = walker.nextNode())){ if(n.nodeValue && n.nodeValue.trim().length>1) out.push(n); }
    return out;
  }
  function buildFocusUnits(){
    clearFocus();
    if(FOCUS==='paragraph'){
      focusUnits = Array.prototype.slice.call(document.querySelectorAll('.chap p, .chap li, .chap h1, .chap h2, .chap h3'));
    } else if(FOCUS==='sentence'){
      // Split each paragraph into sentence spans (keeps layout stable).
      var paras = document.querySelectorAll('.chap p');
      for(var pi=0; pi<paras.length; pi++){
        (function(p){
          if(p.dataset.fsplit==='1') return;
          var text = p.textContent || '';
          var parts = text.match(/[^.!?…]+[.!?…]+["”']?|[^.!?…]+$/g);
          if(!parts || parts.length<2) return;
          p.dataset.fsplit='1'; p.textContent='';
          parts.forEach(function(s){
            var sp=document.createElement('span'); sp.className='fsent'; sp.textContent=s;
            p.appendChild(sp); p.appendChild(document.createTextNode(' '));
          });
        })(paras[pi]);
      }
      focusUnits = Array.prototype.slice.call(document.querySelectorAll('.fsent'));
    }
  }
  function applyFocus(i){
    if(!focusUnits.length) return;
    focusIdx = Math.max(0, Math.min(focusUnits.length-1, i));
    document.querySelectorAll('.focus-active').forEach(function(n){n.classList.remove('focus-active')});
    var el = focusUnits[focusIdx];
    if(el){ el.classList.add('focus-active'); try{ el.scrollIntoView({block:'center',behavior:EINK?'auto':'smooth'}); }catch(_){} }
  }
  // Tap a paragraph/sentence while focus mode is on to jump focus there
  // (long-press selection still works — we only react to quick taps that
  // didn't produce a selection).
  document.addEventListener('click', function(e){
    if(FOCUS==='off' || !focusUnits.length) return;
    var t = e.target && e.target.closest ? (e.target.closest('.fsent') || e.target.closest('p,li')) : null;
    if(!t) return;
    var i = focusUnits.indexOf(t.classList && t.classList.contains('fsent') ? t : t);
    if(i<0 && t.tagName==='P'){ i = focusUnits.indexOf(t); }
    if(i>=0) applyFocus(i);
  });
  // ── D2 bionic-style first-half bolding (runtime, preserves markup) ──
  function applyBionic(){
    if(document.body.dataset.bio==='1') return;
    document.body.dataset.bio='1';
    var nodes = collectTextNodes(document.body);
    // Cap work for huge chapters (perf): first 600 text nodes.
    nodes.slice(0, 600).forEach(function(node){
      var parent = node.parentNode;
      if(!parent || /^(SCRIPT|STYLE)$/.test(parent.tagName)) return;
      if(parent.closest && parent.closest('.kick')) return;
      var words = node.nodeValue.split(/(\s+)/);
      if(words.length<2) return;
      var frag = document.createDocumentFragment();
      words.forEach(function(w){
        if(/^\s*$/.test(w) || w.length<4){ frag.appendChild(document.createTextNode(w)); return; }
        var cut = Math.max(1, Math.ceil(w.length*0.4));
        var b=document.createElement('b'); b.className='bio-b'; b.textContent=w.slice(0,cut);
        frag.appendChild(b); frag.appendChild(document.createTextNode(w.slice(cut)));
      });
      parent.replaceChild(frag, node);
    });
  }
  function clearBionic(){
    document.body.dataset.bio='';
    document.querySelectorAll('.bio-b').forEach(function(b){
      var t=document.createTextNode(b.textContent||'');
      b.parentNode.replaceChild(t, b);
    });
  }
  function initPhase4(){
    if(FOCUS!=='off'){ buildFocusUnits(); applyFocus(0); }
    if(BIONIC){ applyBionic(); }
  }
  function onMsg(e){
    try{
      var m = JSON.parse(e.data);
      if (m.type==='goto'){
        if (m.chapterId){ var el=document.getElementById(m.chapterId); if(el){ el.scrollIntoView(); setTimeout(report,200); } }
        else if (typeof m.ratio==='number'){
          if(PAGINATED){ window.scrollTo(maxScrollX()*m.ratio, 0); } else { window.scrollTo(0, maxScrollY()*m.ratio); }
          setTimeout(report,200);
        }
      } else if (m.type==='pageDelta'){ goPage(curPage() + (RTL?-(m.d||0):(m.d||0))); }
      else if (m.type==='theme'){
        var r=document.documentElement.style;
        if(m.bg)r.setProperty('--bg',m.bg); if(m.fg)r.setProperty('--fg',m.fg);
        if(m.muted)r.setProperty('--muted',m.muted); if(m.acc)r.setProperty('--acc',m.acc);
        if(m.fs)r.setProperty('--fs',m.fs+'px'); if(m.lh)r.setProperty('--lh',m.lh);
        if(m.mx)r.setProperty('--mx',m.mx+'px'); if(m.ff)document.body.style.fontFamily=m.ff;
        if(typeof m.fw==='number')document.body.style.fontWeight=m.fw;
        if(typeof m.hy==='boolean'){
          var all=Array.prototype.slice.call(document.querySelectorAll('p'));
          for(var k=0;k<all.length;k++){
            all[k].style.textAlign=m.hy?'justify':'left';
            try{all[k].style.hyphens=m.hy?'auto':'manual';}catch(_){}
            try{all[k].style.webkitHyphens=m.hy?'auto':'manual';}catch(_){}
          }
        }
      } else if (m.type==='ttsMark'){
        document.querySelectorAll('.tts-active').forEach(function(n){n.classList.remove('tts-active')});
        var ps=document.querySelectorAll('p');
        if(ps.length && typeof m.pIndex==='number'){
          var el2=ps[Math.min(Math.max(0,m.pIndex),ps.length-1)];
          if(el2){ el2.classList.add('tts-active'); el2.scrollIntoView({block:'center',behavior:EINK?'auto':'smooth'}); }
        }
      } else if (m.type==='focus'){
        FOCUS = (m.mode==='sentence'||m.mode==='paragraph') ? m.mode : 'off';
        if(FOCUS==='off'){ document.body.removeAttribute('data-focus'); clearFocus(); }
        else { document.body.setAttribute('data-focus', FOCUS); buildFocusUnits(); applyFocus(0); }
      } else if (m.type==='focusStep'){
        if(FOCUS!=='off'){ applyFocus(focusIdx + (m.d||0)); }
      } else if (m.type==='bionic'){
        BIONIC = !!m.on;
        if(BIONIC){ applyBionic(); } else { clearBionic(); }
      } else if (m.type==='tint'){
        var wash=document.getElementById('tintwash');
        if(wash){ wash.style.display = m.overlay ? 'block' : 'none'; wash.style.background = m.overlay || 'transparent'; }
      } else if (m.type==='bilingual'){
        // E2 — accordion translations under paragraphs (pre-translated per
        // chapter by RN; indexes are global across all chapters).
        document.querySelectorAll('.trans').forEach(function(n){n.remove()});
        var units=document.querySelectorAll('.chap p, .chap li, .chap h1, .chap h2, .chap h3');
        var items=(m.items&&m.items.slice?m.items.slice(0,60):[]);
        for(var bi=0;bi<items.length;bi++){
          (function(it){
            if(!it || typeof it.pIndex!=='number' || typeof it.text!=='string' || !it.text) return;
            var target=units[it.pIndex];
            if(!target || target.nextSibling&&target.nextSibling.className==='trans') return;
            var d=document.createElement('div'); d.className='trans'; d.textContent=it.text;
            target.parentNode.insertBefore(d, target.nextSibling);
          })(items[bi]);
        }
      } else if (m.type==='bilingualClear'){
        document.querySelectorAll('.trans').forEach(function(n){n.remove()});
      }
    }catch(err){}
  }
  setTimeout(function(){
    if (startId){ var el=document.getElementById(startId); if(el){ el.scrollIntoView(); } }
    else if (startRatio>0){
      if(PAGINATED){ window.scrollTo(maxScrollX()*startRatio,0); } else { window.scrollTo(0, maxScrollY()*startRatio); }
    }
    try{ initPhase4(); }catch(_){}
    report();
  }, 280);
})();
</script></body></html>`;
}
