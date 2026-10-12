/*
  Estatísticas individuais de edição no OpenStreetMap (só de quem tem "estatisticas: true").
  - .estatisticas-osm     página do membro (filtro perfil.lua)
  - .estatisticas-painel  aba "Mapeadores" do painel ({{< estatisticas-painel >}})
  Os dados vêm embutidos na página (script application/json), gerados por
  scripts/atualizar-osm-membros.ts e scripts/gerar-dados.ts. Nada é consultado no navegador.
*/
(function () {
  var MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  var COR = { com: "#324170", sem: "#b9c2dc", criadas: "#324170", modificadas: "#7f8bb3", excluidas: "#b9c2dc",
              outras: "#d6d6d0", ferr: ["#324170", "#7a1f21", "#bfa13c", "#5f6170"] };

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function fmt(n) { return Math.round(n).toLocaleString("pt-BR"); }
  function rot(m) { return MES[+m.slice(5, 7) - 1] + "/" + m.slice(2, 4); }
  function rotLongo(m) { return MES[+m.slice(5, 7) - 1] + "/" + m.slice(0, 4); }
  function addMes(m, n) {
    var a = +m.slice(0, 4), b = +m.slice(5, 7) - 1 + n;
    a += Math.floor(b / 12); b = ((b % 12) + 12) % 12;
    return a + "-" + (b < 9 ? "0" : "") + (b + 1);
  }
  function intervalo(a, b) {
    var r = [], m = a;
    while (m <= b && r.length < 2000) { r.push(m); m = addMes(m, 1); }
    return r;
  }
  function dataBR(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString("pt-BR");
  }

  /* Soma os meses pedidos (lista de "AAAA-MM") dos membros dados */
  function somar(membros, meses) {
    var r = { total: 0, changesets: 0, hashtag: 0, criadas: 0, modificadas: 0, excluidas: 0, campo: 0, ferr: {},
              serie: [], ativos: 0, seq: 0 };
    var atual = 0;
    meses.forEach(function (m) {
      var s = { m: m, e: 0, h: 0 };
      membros.forEach(function (mb) {
        var x = mb.porMes[m];
        if (!x) return;
        s.e += x.edicoes; s.h += x.hashtag_edicoes;
        r.changesets += x.changesets; r.criadas += x.criadas; r.modificadas += x.modificadas;
        r.excluidas += x.excluidas; r.campo += x.campo;
        Object.keys(x.ferramentas).forEach(function (f) { r.ferr[f] = (r.ferr[f] || 0) + x.ferramentas[f]; });
      });
      r.total += s.e; r.hashtag += s.h;
      if (s.e > 0) { r.ativos++; atual++; if (atual > r.seq) r.seq = atual; } else { atual = 0; }
      r.serie.push(s);
    });
    return r;
  }
  function indexar(mb) {
    mb.porMes = {};
    mb.meses.forEach(function (x) { mb.porMes[x.m] = x; });
    return mb;
  }

  /* ---------- peças visuais ---------- */
  function barraEmpilhada(partes) {
    var t = partes.reduce(function (a, p) { return a + p[1]; }, 0) || 1;
    var barra = "", leg = "";
    partes.forEach(function (p) {
      if (p[1] <= 0) return;
      var pct = Math.round(100 * p[1] / t);
      barra += '<div class="est-seg" style="flex:' + p[1] + ";background:" + p[2] + '" title="' + esc(p[0]) + ": " + fmt(p[1]) + " (" + pct + '%)"></div>';
      leg += '<span><i style="background:' + p[2] + '"></i>' + esc(p[0]) + " " + pct + "%</span>";
    });
    return '<div class="est-pilha" role="img" aria-label="' + esc(partes.map(function (p) { return p[0] + " " + fmt(p[1]); }).join(", ")) + '">' + barra + '</div><div class="est-leg">' + leg + "</div>";
  }
  function composicao(r) {
    return barraEmpilhada([["Criadas", r.criadas, COR.criadas], ["Modificadas", r.modificadas, COR.modificadas], ["Excluídas", r.excluidas, COR.excluidas]]);
  }
  function ferramentas(r) {
    var l = Object.keys(r.ferr).map(function (k) { return [k, r.ferr[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    var partes = l.slice(0, 4).map(function (x, i) { return [x[0], x[1], COR.ferr[i]]; });
    var resto = l.slice(4).reduce(function (a, x) { return a + x[1]; }, 0);
    if (resto > 0) partes.push(["Outras", resto, COR.outras]);
    return barraEmpilhada(partes);
  }
  function medidor(rotulo, pct, texto) {
    return '<div class="est-med"><div class="est-med-t"><span>' + rotulo + "</span><span>" + texto + '</span></div><div class="est-med-b"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div></div>';
  }
  function linha(serie, w, h) {
    var mx = Math.max.apply(null, serie.map(function (s) { return s.e; }).concat([1]));
    var n = Math.max(serie.length - 1, 1);
    var p = serie.map(function (s, i) { return (4 + i * (w - 8) / n).toFixed(1) + "," + (h - 4 - (h - 8) * s.e / mx).toFixed(1); }).join(" ");
    return '<svg viewBox="0 0 ' + w + " " + h + '" width="100%" role="img" aria-label="Edições por mês"><polyline points="' + p + '" fill="none" stroke="#324170" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }
  function faixa(serie, w) {
    var mx = Math.max.apply(null, serie.map(function (s) { return s.e; }).concat([1]));
    var c = (w - 4) / Math.max(serie.length, 1), passo = Math.max(1, Math.ceil(serie.length / 8));
    var o = '<svg viewBox="0 0 ' + w + ' 34" width="100%" role="img" aria-label="Intensidade de edições por mês">';
    serie.forEach(function (s, i) {
      var f = s.e === 0 ? "#eef0f6" : "rgba(50,65,112," + (0.2 + 0.8 * s.e / mx).toFixed(2) + ")";
      o += '<rect x="' + (2 + i * c) + '" y="2" width="' + Math.max(c - 3, 2) + '" height="24" rx="3" fill="' + f + '"><title>' + rotLongo(s.m) + ": " + fmt(s.e) + " edições</title></rect>";
      if (i % passo === 0) o += '<text x="' + (2 + i * c) + '" y="33" font-size="10" fill="#5f6170">' + rot(s.m) + "</text>";
    });
    return o + "</svg>";
  }
  function colunas(serie, w, h) {
    var mx = Math.max.apply(null, serie.map(function (s) { return s.e; }).concat([1]));
    var bw = (w - 34) / Math.max(serie.length, 1), passo = Math.max(1, Math.ceil(serie.length / 7));
    var o = '<svg viewBox="0 0 ' + w + " " + h + '" width="100%" role="img" aria-label="Edições por mês, com e sem a hashtag"><line x1="30" x2="' + w + '" y1="' + (h - 18) + '" y2="' + (h - 18) + '" stroke="#c9ccd6"/>';
    for (var k = 1; k <= 3; k++) {
      var y = (h - 18) - (h - 30) * k / 3;
      o += '<line x1="30" x2="' + w + '" y1="' + y + '" y2="' + y + '" stroke="#e4e6ee"/><text x="26" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="#5f6170">' + fmt(mx * k / 3) + "</text>";
    }
    serie.forEach(function (s, i) {
      var x = 34 + i * bw, H = (h - 30) * s.e / mx, Hh = (h - 30) * s.h / mx, lw = Math.max(bw - 2, 1.5);
      o += '<g><title>' + rotLongo(s.m) + ": " + fmt(s.e) + " edições (" + fmt(s.h) + " com a hashtag)</title>" +
           '<rect x="' + x + '" y="' + (h - 18 - H) + '" width="' + lw + '" height="' + H + '" rx="2" fill="' + COR.sem + '"/>' +
           '<rect x="' + x + '" y="' + (h - 18 - Hh) + '" width="' + lw + '" height="' + Hh + '" rx="2" fill="' + COR.com + '"/></g>';
      if (i % passo === 0) o += '<text x="' + x + '" y="' + (h - 4) + '" font-size="10" fill="#5f6170">' + rot(s.m) + "</text>";
    });
    return o + "</svg>";
  }

  /* ---------- página do membro ---------- */
  function perfil(el) {
    var dados = JSON.parse(el.querySelector(".est-dados").textContent);
    var mb = indexar(dados.membro);
    var corpo = el.querySelector(".est-corpo");
    var N = dados.meses_recentes > 0 ? dados.meses_recentes : 12;
    var fim = (mb.atualizado || dados.gerado_em || "").slice(0, 7);
    /* Largura total: tira a seção da coluna do texto (layout "trestles") e a põe depois do perfil */
    var perfilBloco = document.querySelector(".quarto-about-trestles");
    if (perfilBloco && perfilBloco.contains(el)) perfilBloco.insertAdjacentElement("afterend", el);
    if (!mb.meses.length) {
      corpo.innerHTML = '<p class="est-vazio">Ainda não há edições registradas no OpenStreetMap para este usuário.</p>';
      return;
    }
    var primeiro = (dados.inicio || mb.meses[0].m).slice(0, 7);
    var hashtag = (dados.hashtags && dados.hashtags[0]) || "";

    corpo.innerHTML = '<div class="est-filtro" role="group" aria-label="Período das estatísticas">' +
      '<button type="button" data-n="' + N + '">Últimos ' + N + " meses</button>" +
      '<button type="button" data-n="0">Desde o início do programa</button></div><div class="est-conteudo"></div>' +
      '<p class="est-nota">Fonte: API do OpenStreetMap, atualizada em ' + dataBR(mb.atualizado) +
      ". Considera todas as edições da conta, com ou sem a hashtag" + (hashtag ? " #" + esc(hashtag) : "") +
      ". O total do programa vem do ohsomeNow (só com a hashtag) e não coincide com a soma individual.</p>";
    var botoes = corpo.querySelectorAll(".est-filtro button");
    var area = corpo.querySelector(".est-conteudo");

    function desenhar(n) {
      var ini = n > 0 ? addMes(fim, -(n - 1)) : primeiro;
      var meses = intervalo(ini, fim);
      var r = somar([mb], meses);
      var periodo = n > 0 ? "nos últimos " + n + " meses" : "de " + rotLongo(primeiro) + " a " + rotLongo(fim);
      var pctHash = r.total ? Math.round(100 * r.hashtag / r.total) : 0;
      var pctCampo = r.total ? Math.round(100 * r.campo / r.total) : 0;
      area.innerHTML =
        '<div class="est-hero"><span class="est-numero">' + fmt(r.total) + '</span><span class="est-texto">edições em ' + fmt(r.changesets) + " changesets, " + periodo + "</span></div>" +
        '<div class="est-linha">' + linha(r.serie, 640, 46) + "</div>" +
        '<p class="est-sub">Atividade por mês (mais escuro, mais edições)</p>' + faixa(r.serie, 640) +
        '<div class="est-medidores">' +
          medidor("Meses ativos", 100 * r.ativos / Math.max(meses.length, 1), r.ativos + " de " + meses.length) +
          medidor("Com a hashtag", pctHash, pctHash + "%") +
          medidor("Em campo (source=survey)", pctCampo, pctCampo + "%") +
        "</div>" +
        (r.seq > 0 ? '<p class="est-sub">Maior sequência de meses com edições: <strong>' + r.seq + (r.seq === 1 ? " mês" : " meses") + "</strong></p>" : "") +
        '<p class="est-sub">Composição das edições</p>' + composicao(r) +
        '<p class="est-sub">Ferramentas mais usadas</p>' + ferramentas(r);
    }
    for (var i = 0; i < botoes.length; i++) {
      (function (b) {
        b.addEventListener("click", function () {
          for (var j = 0; j < botoes.length; j++) { botoes[j].classList.remove("ativo"); botoes[j].setAttribute("aria-pressed", "false"); }
          b.classList.add("ativo"); b.setAttribute("aria-pressed", "true");
          desenhar(+b.getAttribute("data-n"));
        });
      })(botoes[i]);
    }
    botoes[0].classList.add("ativo"); botoes[0].setAttribute("aria-pressed", "true"); botoes[1].setAttribute("aria-pressed", "false");
    desenhar(N);
  }

  /* ---------- aba do painel ---------- */
  function painel(el) {
    var dados = JSON.parse(el.querySelector(".est-dados").textContent);
    var membros = dados.membros.map(indexar);
    var N = dados.meses_recentes > 0 ? dados.meses_recentes : 12;
    if (!membros.length) { el.querySelector(".est-corpo").innerHTML = '<p class="est-vazio">Nenhum membro com estatísticas autorizadas ainda.</p>'; return; }
    var fim = (dados.gerado_em || "").slice(0, 7) || new Date().toISOString().slice(0, 7);
    var inicio = (dados.inicio || "").slice(0, 7) || membros.reduce(function (m, mb) { return mb.meses.length && mb.meses[0].m < m ? mb.meses[0].m : m; }, fim);
    var todosMeses = intervalo(inicio, fim);
    var anoSel = "Todos";
    var selM = {}, selP = {};
    membros.forEach(function (mb) { selM[mb.id] = true; });
    var corpo = el.querySelector(".est-corpo");
    corpo.innerHTML =
      '<div class="est-filtros">' +
        '<div class="est-campo"><label class="est-rot-p">Período</label><button type="button" class="est-dd" data-dd="p" aria-haspopup="true" aria-expanded="false"></button><div class="est-pn" data-pn="p"></div></div>' +
        '<div class="est-campo"><label>Membros</label><button type="button" class="est-dd" data-dd="m" aria-haspopup="true" aria-expanded="false"></button><div class="est-pn" data-pn="m"></div></div>' +
        '<div class="est-campo"><label for="est-ordem">Ordenar membros por</label><select id="est-ordem"><option value="desc">Mais edições</option><option value="asc">Menos edições</option><option value="az">Nome (A–Z)</option></select></div>' +
      '</div><div class="est-kpis"></div>' +
      '<div class="est-duas"><div><p class="est-sub">Edições por mês</p><div class="est-leg"><span><i style="background:' + COR.com + '"></i>Com a hashtag</span><span><i style="background:' + COR.sem + '"></i>Sem a hashtag</span></div><div class="est-g"></div></div>' +
      '<div><p class="est-sub">Edições por membro</p><div class="est-r"></div></div></div>' +
      '<div class="est-duas"><div><p class="est-sub">Composição das edições</p><div class="est-comp"></div></div><div><p class="est-sub">Ferramentas mais usadas</p><div class="est-fer"></div></div></div>' +
      '<p class="est-nota">Só aparecem membros que autorizaram (estatisticas: true). Fonte: API do OpenStreetMap, atualizada em ' + dataBR(dados.gerado_em) +
      ", a partir de " + rotLongo(inicio) + ". Considera todas as edições de cada conta; o total do programa (ohsomeNow) conta só as com a hashtag e não coincide com esta soma.</p>";

    var botaoP = corpo.querySelector('[data-dd="p"]'), botaoM = corpo.querySelector('[data-dd="m"]');
    var pnP = corpo.querySelector('[data-pn="p"]'), pnM = corpo.querySelector('[data-pn="m"]');

    /* Meses disponíveis: todos, ou só os do ano escolhido no filtro geral do painel */
    function visiveis() {
      return anoSel === "Todos" ? todosMeses : todosMeses.filter(function (m) { return m.slice(0, 4) === anoSel; });
    }
    function definirP(f) { visiveis().forEach(function (m) { selP[m] = f(m); }); }
    function padraoP() {
      if (anoSel === "Todos") { var lim = addMes(fim, -(N - 1)); definirP(function (m) { return m >= lim; }); }
      else definirP(function () { return true; });
    }
    function resumoP() {
      var v = visiveis(), sel = v.filter(function (m) { return selP[m]; });
      if (!sel.length) return "Nenhum mês";
      if (sel.length === v.length) return "Todos os meses (" + sel.length + ")";
      var cont = sel.every(function (m, i) { return i === 0 || m === addMes(sel[i - 1], 1); });
      if (cont && sel[sel.length - 1] === fim && anoSel === "Todos") return "Últimos " + sel.length + " meses";
      if (cont) return rot(sel[0]) + " a " + rot(sel[sel.length - 1]);
      return sel.length + " meses selecionados";
    }
    function resumoM() {
      var c = membros.filter(function (mb) { return selM[mb.id]; }).length;
      return c === membros.length ? "Todos (" + c + ")" : c === 0 ? "Nenhum" : c + " de " + membros.length + " membros";
    }
    function montarPainel(pn, itens, sel, acoes, aoMudar) {
      var h = '<div class="est-ac">' + acoes.map(function (a, i) { return '<button type="button" data-a="' + i + '">' + esc(a[0]) + "</button>"; }).join("") + '</div><div class="est-ls">' +
        itens.map(function (it) { return '<label><input type="checkbox" data-k="' + esc(it[0]) + '"' + (sel[it[0]] ? " checked" : "") + ">" + esc(it[1]) + "</label>"; }).join("") + "</div>";
      pn.innerHTML = h;
      [].forEach.call(pn.querySelectorAll("input"), function (c) { c.addEventListener("change", function () { sel[c.getAttribute("data-k")] = c.checked; aoMudar(); }); });
      [].forEach.call(pn.querySelectorAll(".est-ac button"), function (b) {
        b.addEventListener("click", function () { acoes[+b.getAttribute("data-a")][1](); montarPainel(pn, itens, sel, acoes, aoMudar); aoMudar(); });
      });
    }
    function acoesP() {
      var base = [["Todos", function () { definirP(function () { return true; }); }], ["Nenhum", function () { definirP(function () { return false; }); }]];
      if (anoSel === "Todos") {
        base.push(["Últimos " + N, function () { definirP(function (m) { return m >= addMes(fim, -(N - 1)); }); }]);
        base.push(["Últimos 3", function () { definirP(function (m) { return m >= addMes(fim, -2); }); }]);
        base.push(["Últimos 24", function () { definirP(function (m) { return m >= addMes(fim, -23); }); }]);
      } else {
        base.push(["1º semestre", function () { definirP(function (m) { return m.slice(5, 7) <= "06"; }); }]);
        base.push(["2º semestre", function () { definirP(function (m) { return m.slice(5, 7) > "06"; }); }]);
      }
      return base;
    }
    function montarP() {
      corpo.querySelector(".est-rot-p").textContent = anoSel === "Todos" ? "Período" : "Meses de " + anoSel;
      montarPainel(pnP, visiveis().slice().reverse().map(function (m) { return [m, rotLongo(m)]; }), selP, acoesP(), atualizar);
    }
    var itensM = membros.map(function (mb) { return [mb.id, mb.nome]; });
    var acoesM = [["Todos", function () { membros.forEach(function (mb) { selM[mb.id] = true; }); }], ["Nenhum", function () { membros.forEach(function (mb) { selM[mb.id] = false; }); }]];

    function atualizar() {
      botaoP.innerHTML = "<span>" + esc(resumoP()) + '</span><i aria-hidden="true">▾</i>';
      botaoM.innerHTML = "<span>" + esc(resumoM()) + '</span><i aria-hidden="true">▾</i>';
      var ms = visiveis().filter(function (m) { return selP[m]; });
      var ativos = membros.filter(function (mb) { return selM[mb.id]; });
      var r = somar(ativos, ms);
      corpo.querySelector(".est-kpis").innerHTML = [["Membros", ativos.length], ["Edições", fmt(r.total)], ["Changesets", fmt(r.changesets)], ["Meses com atividade", r.ativos + " de " + ms.length]]
        .map(function (x) { return '<div class="est-kpi"><small>' + x[0] + "</small><b>" + x[1] + "</b></div>"; }).join("");
      corpo.querySelector(".est-g").innerHTML = ms.length ? colunas(r.serie, 560, 170) : '<p class="est-vazio">Nenhum mês selecionado.</p>';
      var linhas = ativos.map(function (mb) { return [mb, somar([mb], ms).total]; });
      var ord = corpo.querySelector("#est-ordem").value;
      linhas.sort(function (a, b) { return ord === "az" ? a[0].nome.localeCompare(b[0].nome, "pt") : ord === "asc" ? a[1] - b[1] : b[1] - a[1]; });
      var mx = Math.max.apply(null, linhas.map(function (l) { return l[1]; }).concat([1]));
      corpo.querySelector(".est-r").innerHTML = linhas.length ? linhas.map(function (l) {
        return '<div class="est-hb"><a class="est-hb-t" href="equipe/' + esc(l[0].id) + '.html">' + esc(l[0].nome) + '</a><span class="est-hb-b"><i style="width:' + Math.round(100 * l[1] / mx) + '%"></i></span><span class="est-hb-v">' + fmt(l[1]) + "</span></div>";
      }).join("") : '<p class="est-vazio">Nenhum membro selecionado.</p>';
      corpo.querySelector(".est-comp").innerHTML = composicao(r);
      corpo.querySelector(".est-fer").innerHTML = ferramentas(r);
    }

    /* Ano do filtro geral do painel (OJS: window.__estAno / window.__estPainel.setAno) */
    function normalizarAno(a) {
      var s = String(a === undefined || a === null ? "Todos" : a);
      return /^[0-9]{4}$/.test(s) ? s : "Todos";
    }
    function definirAno(a) { anoSel = normalizarAno(a); padraoP(); montarP(); atualizar(); }
    window.__estPainel = { setAno: definirAno };
    anoSel = normalizarAno(window.__estAno);
    padraoP();
    montarP();
    montarPainel(pnM, itensM, selM, acoesM, atualizar);
    function fechar() { pnP.classList.remove("aberto"); pnM.classList.remove("aberto"); botaoP.setAttribute("aria-expanded", "false"); botaoM.setAttribute("aria-expanded", "false"); }
    [[botaoP, pnP], [botaoM, pnM]].forEach(function (par) {
      par[0].addEventListener("click", function (e) { e.stopPropagation(); var abrir = !par[1].classList.contains("aberto"); fechar(); if (abrir) { par[1].classList.add("aberto"); par[0].setAttribute("aria-expanded", "true"); } });
      par[1].addEventListener("click", function (e) { e.stopPropagation(); });
    });
    document.addEventListener("click", fechar);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") fechar(); });
    corpo.querySelector("#est-ordem").addEventListener("change", atualizar);
    atualizar();
  }

  function iniciar() {
    [].forEach.call(document.querySelectorAll(".estatisticas-osm"), function (el) { try { perfil(el); } catch (e) { console.error(e); } });
    [].forEach.call(document.querySelectorAll(".estatisticas-painel"), function (el) { try { painel(el); } catch (e) { console.error(e); } });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
