-- Funções compartilhadas pelos comandos {{< proximos >}} e {{< agenda >}}
local M = {}

function M.raiz() return (quarto.project and quarto.project.directory) or "." end

function M.agenda()
  local f = io.open(M.raiz() .. "/dados/painel/agenda.json", "r")
  if not f then return nil end
  local t = f:read("a"); f:close()
  local ok, d = pcall(pandoc.json.decode, t, false)
  return ok and d or nil
end

-- Caminho da página atual até a raiz do site ("" na raiz, "../../" em eventos/x/)
function M.ate_raiz()
  local entrada = (quarto.doc.input_file or ""):gsub("\\", "/")
  local raiz = M.raiz():gsub("\\", "/")
  local rel = entrada:sub(#raiz + 2)
  local _, n = rel:gsub("/", "")
  return string.rep("../", n)
end

function M.esc(s)
  return (tostring(s or ""):gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"):gsub('"', "&quot;"))
end

M.MESES = { "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez" }
M.MESES_LONGOS = { "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
                   "agosto", "setembro", "outubro", "novembro", "dezembro" }

-- "2026-11-12" (+ "2026-11-13") -> "12 de novembro" / "12 a 13 de novembro" / "30 de out. a 2 de nov."
function M.quando(d0, d1)
  local a0, m0, x0 = d0:match("(%d+)-(%d+)-(%d+)")
  if not d1 or d1 == pandoc.json.null or d1 == d0 then
    return tonumber(x0) .. " de " .. M.MESES_LONGOS[tonumber(m0)] .. " de " .. a0
  end
  local a1, m1, x1 = d1:match("(%d+)-(%d+)-(%d+)")
  if m0 == m1 and a0 == a1 then
    return tonumber(x0) .. " a " .. tonumber(x1) .. " de " .. M.MESES_LONGOS[tonumber(m0)] .. " de " .. a0
  end
  return tonumber(x0) .. " de " .. M.MESES_LONGOS[tonumber(m0)] .. " a " .. tonumber(x1) .. " de " ..
         M.MESES_LONGOS[tonumber(m1)] .. " de " .. a1
end

function M.dependencia(extras)
  quarto.doc.add_html_dependency({ name = "agenda-ym", version = "1.0.0", scripts = { "agenda.js" } })
  if extras then quarto.doc.add_html_dependency(extras) end
end

return M
