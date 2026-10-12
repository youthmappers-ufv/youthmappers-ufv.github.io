-- Funções compartilhadas: leitura dos arquivos gerados por scripts/gerar-dados.ts
local M = {}

function M.raiz()
  return (quarto.project and quarto.project.directory) or "."
end

local function ler_json(rel)
  local f = io.open(M.raiz() .. "/" .. rel, "r")
  if not f then return nil end
  local texto = f:read("a")
  f:close()
  local ok, dados = pcall(pandoc.json.decode, texto, false)
  if ok then return dados end
  return nil
end

function M.dados_equipe()
  return ler_json("dados/painel/equipe.json")
end

-- Estatísticas individuais (só membros com "estatisticas: true"): dados/painel/estatisticas.json
function M.estatisticas()
  return ler_json("dados/painel/estatisticas.json")
end

-- JSON seguro para embutir numa tag <script> (sem fechar a tag por engano)
function M.json_embutido(obj)
  return (pandoc.json.encode(obj):gsub("</", "<" .. string.char(92) .. "/"))
end

-- Folha de estilo e script das estatísticas (uma vez por página)
function M.dependencia_estatisticas()
  quarto.doc.add_html_dependency({
    name = "estatisticas-osm", version = "1.0.0",
    scripts = { "estatisticas.js" }, stylesheets = { "estatisticas.css" },
  })
end

return M
