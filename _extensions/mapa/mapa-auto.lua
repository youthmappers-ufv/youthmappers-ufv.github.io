--[[
  Filtro: se a pasta do evento ou projeto tem um arquivo "area.geojson", acrescenta ao fim
  da página a seção "Área mapeada" com o mapa, sem precisar escrever nada na página.
  Para marcar um ponto (sem arquivo), continue usando {{< mapa centro="lat, lon" zoom="16" >}}
  no texto. Se a página já tiver um mapa, o filtro não acrescenta outro.
  Ativado em eventos/_metadata.yml e projetos/_metadata.yml.
]]
local function existe(caminho)
  local f = io.open(caminho, "r")
  if f then f:close(); return true end
  return false
end

local function tem_mapa(blocos)
  local achou = false
  for _, b in ipairs(blocos) do
    if b.t == "RawBlock" and b.text:find('class="mapa"', 1, true) then achou = true end
  end
  return achou
end

function Pandoc(doc)
  local entrada = (quarto.doc.input_file or ""):gsub(string.char(92), "/")
  local pasta = entrada:match("^(.*)/[^/]+$") or "."
  if not existe(pasta .. "/area.geojson") then return nil end
  if tem_mapa(doc.blocks) then return nil end
  local modulo = dofile(quarto.utils.resolve_path("mapa.lua"))
  local bloco = modulo["mapa"]({ pandoc.Str("area.geojson") }, {}, doc.meta)
  doc.blocks:insert(pandoc.Header(2, "Área mapeada", pandoc.Attr("area-mapeada-auto")))
  doc.blocks:insert(bloco)
  return doc
end
