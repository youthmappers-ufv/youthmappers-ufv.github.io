// Monta os mapas criados por {{< mapa >}} (_extensions/mapa/mapa.lua).
// Cada mapa é um <div class="mapa"> com as opções em atributos data-*.
(function () {
  const COR = "#7a1f21";   // vinho do tema (contorno e preenchimento das áreas)

  // Os arquivos de marcador ficam na mesma pasta deste script no site publicado
  const BASE = document.currentScript ? document.currentScript.src.replace(/[^/]*$/, "") : "";

  // Marcador com o logo (arquivo escolhido em "mapa: marcador:" no _quarto.yml).
  // Os desenhos têm 48 x 64, com a ponta em (24, 62); exibidos a 42 x 56.
  function icone(nome) {
    return L.icon({
      iconUrl: BASE + nome,
      iconSize: [42, 56],
      iconAnchor: [21, 54],
      tooltipAnchor: [0, -40],
      className: "mapa-marcador",
    });
  }

  // Nome da feição (se houver) vira dica ao passar o mouse
  function nomeDa(feicao) {
    const p = (feicao && feicao.properties) || {};
    return p.nome || p.name || p.titulo || p.title || null;
  }

  function montar(div) {
    const mapa = L.map(div, { scrollWheelZoom: false });   // rolar a página não dá zoom
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; colaboradores do <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapa);
    mapa.on("click", () => mapa.scrollWheelZoom.enable());  // após um clique, a roda passa a dar zoom

    const marcador = icone(div.dataset.icone || "marcador-b.svg");
    const zoom = Number(div.dataset.zoom || 15);
    if (div.dataset.centro) {
      const [lat, lon] = div.dataset.centro.split(",").map(Number);
      mapa.setView([lat, lon], zoom);
      if (div.dataset.marcador !== "nao") L.marker([lat, lon], { icon: marcador }).addTo(mapa);
    }

    if (div.dataset.geojson) {
      fetch(div.dataset.geojson)
        .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then((dados) => {
          const area = L.geoJSON(dados, {
            style: { color: COR, weight: 2, fillOpacity: 0.15 },
            pointToLayer: (_f, latlng) => L.marker(latlng, { icon: marcador }),
            onEachFeature: (f, camada) => { const n = nomeDa(f); if (n) camada.bindTooltip(n); },
          }).addTo(mapa);
          // Sem "centro", o mapa se ajusta à área do arquivo
          if (!div.dataset.centro) mapa.fitBounds(area.getBounds(), { padding: [20, 20], maxZoom: 17 });
        })
        .catch((e) => {
          div.insertAdjacentHTML("beforeend", '<div class="mapa-erro-carga">Não foi possível carregar a área do mapa.</div>');
          console.error("mapa: falha ao carregar " + div.dataset.geojson, e);
        });
    }
  }

  function iniciar() { document.querySelectorAll("div.mapa[id^='mapa-']").forEach(montar); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
