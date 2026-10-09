-- Funções compartilhadas: leitura do arquivo gerado por scripts/gerar-dados.ts
local M = {}

function M.raiz()
  return (quarto.project and quarto.project.directory) or "."
end

function M.dados_equipe()
  local f = io.open(M.raiz() .. "/dados/painel/equipe.json", "r")
  if not f then return nil end
  local texto = f:read("a")
  f:close()
  local ok, dados = pcall(pandoc.json.decode, texto, false)
  if ok then return dados end
  return nil
end

return M
