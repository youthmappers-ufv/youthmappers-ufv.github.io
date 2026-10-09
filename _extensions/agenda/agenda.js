// Comportamento das seções de agenda ({{< proximos >}} e {{< agenda >}}).
(function () {
  const DIA = 86400000;
  const hojeISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const dias = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / DIA);

  // ---------- Próximas ações: esconde o que já passou e mostra a contagem ----------
  function proximos() {
    const hoje = hojeISO();
    document.querySelectorAll("[data-proximos]").forEach((secao) => {
      let visiveis = 0;
      secao.querySelectorAll(".proximo").forEach((c) => {
        if (c.dataset.termina < hoje) { c.remove(); return; }   // passou desde a última publicação
        visiveis++;
        const n = dias(hoje, c.dataset.inicio);
        const alvo = c.querySelector("[data-contagem]");
        alvo.textContent = n > 1 ? `Daqui a ${n} dias` : n === 1 ? "Amanhã" : n === 0 ? "Hoje" : "Acontecendo agora";
        if (n <= 1) c.classList.add("proximo-iminente");
      });
      if (visiveis === 0) secao.remove();
    });
  }

  // ---------- Agenda: botões de assinatura e calendário ----------
  function agenda() {
    const div = document.getElementById("calendario");
    if (!div || typeof FullCalendar === "undefined") return;

    const icsHttps = new URL(div.dataset.ics, location.href).href;
    const webcal = icsHttps.replace(/^https?:/, "webcal:");
    document.querySelectorAll("[data-assinar]").forEach((el) => {
      const tipo = el.dataset.assinar;
      if (tipo === "google") el.href = "https://calendar.google.com/calendar/r?cid=" + encodeURIComponent(webcal);
      if (tipo === "webcal") el.href = webcal;
      if (tipo === "copiar") el.addEventListener("click", () => {
        navigator.clipboard?.writeText(icsHttps);
        const p = document.querySelector("[data-assinar-endereco]");
        if (p) p.textContent = "Endereço copiado: " + icsHttps;
      });
    });

    fetch(div.dataset.eventos).then((r) => r.json()).then((lista) => {
      const raiz = div.dataset.raiz || "";
      const eventos = lista.map((ev) => ({
        title: ev.titulo,
        start: ev.inicio, end: ev.fim, allDay: ev.dia_inteiro,
        url: raiz + ev.url,
        backgroundColor: ev.cor, borderColor: ev.cor, textColor: ev.cor_texto,
        extendedProps: { tipo: ev.tipo_nome, lugar: ev.lugar },
      }));
      const estreita = window.matchMedia("(max-width: 700px)").matches;
      const cal = new FullCalendar.Calendar(div, {
        locale: "pt-br",
        initialView: estreita ? "listYear" : "dayGridMonth",
        headerToolbar: { left: "prev,next today", center: "title", right: "dayGridMonth,listYear" },
        buttonText: { listYear: "lista do ano" },
        views: { listYear: { displayEventTime: true } },
        height: "auto",
        dayMaxEvents: 3,
        eventDisplay: "block",
        displayEventTime: false,          // no mês, só o título (horário aparece na lista e na dica)
        events: eventos,
        eventDidMount: (info) => {
          const p = info.event.extendedProps;
          info.el.title = [info.event.title, p.tipo, p.lugar].filter((x) => x).join(" · ");
        },
        noEventsContent: "Nenhum evento neste período.",
      });
      cal.render();

      // Legenda das cores, só com os tipos que aparecem na agenda
      const leg = document.querySelector("[data-legenda]");
      if (leg) {
        const tipos = new Map(lista.map((ev) => [ev.tipo_nome, ev.cor]));
        leg.innerHTML = [...tipos].map(([n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join("");
      }
    });
  }

  // Roda depois do carregamento completo: os scripts de navegação do Quarto
  // reescrevem os links da página ao carregar e desfariam os endereços de assinatura
  function iniciar() { proximos(); agenda(); }
  if (document.readyState === "complete") iniciar();
  else window.addEventListener("load", iniciar);
})();
