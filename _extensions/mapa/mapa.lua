--[[
  {{< mapa >}}: mapa interativo (Leaflet + OpenStreetMap) para eventos e projetos.

  Uso:
    {{< mapa area.geojson >}}                      área de um arquivo GeoJSON
    {{< mapa geojson="area.geojson" >}}            (mesma coisa, com nome)
    {{< mapa centro="-23.0068, -44.3181" >}}       ponto, com marcador
    {{< mapa centro="-23.0068, -44.3181" zoom="14" marcador="nao" >}}

  Opções:
    geojson   arquivo .geojson na pasta da página (o mapa se ajusta à área)
    centro    "latitude, longitude", como no openstreetmap.org
              (botão direito no mapa > "Mostrar endereço")
    zoom      nível de aproximação, de 1 (mundo) a 19 (rua); padrão 15
    marcador  "nao" para não marcar o centro
    altura    altura do mapa; padrão 380px
    descricao texto lido por leitores de tela; padrão "Mapa da área mapeada"

  Marcador: definido para o site inteiro no _quarto.yml, pelo nome do arquivo
  em _extensions/mapa/marcadores/:
    mapa:
      marcador: marcador-b.svg     # marcador-a.svg, marcador-b.svg ou marcador-c.svg

  O código do mapa fica em _extensions/mapa/mapa.js; a página contém só o
  bloco do mapa. A biblioteca Leaflet vem junto com o site (sem depender de
  CDN) e é carregada uma única vez, mesmo com vários mapas na página.
]]

local contador = 0

local function esc(s)
  return (tostring(s or ""):gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"):gsub('"', "&quot;"))
end

local function existe(caminho)
  local f = io.open(caminho, "r")
  if f then f:close(); return true end
  return false
end

local function aviso(msg)
  quarto.log.warning("mapa (" .. (quarto.doc.input_file or "?") .. "): " .. msg)
  return pandoc.Div({ pandoc.Para({ pandoc.Str("Mapa indisponível: " .. msg) }) }, pandoc.Attr("", { "mapa-erro" }))
end

local MARCADOR_PADRAO = "marcador-b.svg"

-- Arquivo do marcador escolhido no _quarto.yml (mapa: marcador: ...)
local function marcador_do_site(meta)
  local nome = MARCADOR_PADRAO
  if meta and meta.mapa and meta.mapa.marcador then
    nome = pandoc.utils.stringify(meta.mapa.marcador)
  end
  if not existe(quarto.utils.resolve_path("marcadores/" .. nome)) then
    quarto.log.warning('mapa: o marcador "' .. nome .. '" não existe em _extensions/mapa/marcadores/; usando ' .. MARCADOR_PADRAO)
    nome = MARCADOR_PADRAO
  end
  return nome
end

return {
  ["mapa"] = function(args, kwargs, meta)
    local function opcao(nome)
      local v = kwargs[nome] and pandoc.utils.stringify(kwargs[nome]) or ""
      return v ~= "" and v or nil
    end
    local geojson = opcao("geojson") or (args[1] and pandoc.utils.stringify(args[1])) or nil
    local centro = opcao("centro")
    local zoom = opcao("zoom") or "15"
    local marcador = opcao("marcador") ~= "nao"
    local altura = opcao("altura") or "380px"
    local descricao = opcao("descricao") or "Mapa da área mapeada"

    if not geojson and not centro then
      return aviso('informe um arquivo GeoJSON ou o centro, ex.: {{< mapa centro="-19.19, -46.24" >}}')
    end

    -- O arquivo precisa existir na pasta da página
    if geojson then
      local pasta = (quarto.doc.input_file or ""):match("^(.*)[/\\]") or "."
      if not existe(pasta .. "/" .. geojson) then
        return aviso('arquivo "' .. geojson .. '" não encontrado na pasta da página')
      end
    end

    -- Coordenadas no formato "latitude, longitude"
    local lat, lon
    if centro then
      lat, lon = centro:match("^%s*(%-?%d+%.?%d*)%s*,%s*(%-?%d+%.?%d*)%s*$")
      lat, lon = tonumber(lat), tonumber(lon)
      if not lat or lat < -90 or lat > 90 or lon < -180 or lon > 180 then
        return aviso('"centro" deve ser "latitude, longitude", ex.: "-19.19, -46.24" (recebido: ' .. centro .. ")")
      end
    end
    if not tonumber(zoom) or tonumber(zoom) < 1 or tonumber(zoom) > 19 then
      return aviso('"zoom" deve ser um número de 1 a 19')
    end

    -- Biblioteca e código do mapa: incluídos uma única vez por página
    quarto.doc.add_html_dependency({
      name = "leaflet", version = "1.9.4",
      scripts = { "leaflet/leaflet.js" }, stylesheets = { "leaflet/leaflet.css" },
      -- as imagens da Leaflet (marcador padrão, controle de camadas) não são usadas:
      -- o marcador é desenhado em SVG por mapa.js
    })
    local icone = marcador_do_site(meta)
    quarto.doc.add_html_dependency({
      name = "mapa-ym", version = "1.1.0", scripts = { "mapa.js" },
      resources = { { name = icone, path = "marcadores/" .. icone } },
    })

    contador = contador + 1
    local atributos = {
      'id="mapa-' .. contador .. '"', 'class="mapa"', 'role="region"',
      'aria-label="' .. esc(descricao) .. '"', 'style="height: ' .. esc(altura) .. '"',
      'data-zoom="' .. esc(zoom) .. '"', 'data-marcador="' .. (marcador and "sim" or "nao") .. '"',
      'data-icone="' .. esc(icone) .. '"',
    }
    if geojson then table.insert(atributos, 'data-geojson="' .. esc(geojson) .. '"') end
    if lat then table.insert(atributos, 'data-centro="' .. lat .. "," .. lon .. '"') end
    return pandoc.RawBlock("html", "<div " .. table.concat(atributos, " ") .. "></div>")
  end,
}
