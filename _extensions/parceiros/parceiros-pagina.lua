--[[
  Filtro: acrescenta ao fim da página de um evento ou projeto a seção "Parceiros",
  com logo e link de cada parceiro listado em "parceiros:" no cabeçalho.
  Parceiros sem logo aparecem pelo nome. Nada a escrever na página: basta o cabeçalho.
  Ativado em eventos/_metadata.yml, noticias/_metadata.yml e projetos/_metadata.yml.
]]
local function raiz() return (quarto.project and quarto.project.directory) or "." end

local function ler_json(rel)
  local f = io.open(raiz() .. "/" .. rel, "r")
  if not f then return nil end
  local t = f:read("a"); f:close()
  local ok, d = pcall(pandoc.json.decode, t, false)
  return ok and d or nil
end

local function esc(s)
  return (tostring(s or ""):gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"):gsub('"', "&quot;"))
end

local function valor(v)
  if v == nil or v == pandoc.json.null or v == "" then return nil end
  return v
end

function Pandoc(doc)
  local ids = {}
  local m = doc.meta.parceiros
  if m == nil then return nil end
  if pandoc.utils.type(m) == "List" then
    for _, x in ipairs(m) do table.insert(ids, pandoc.utils.stringify(x)) end
  else
    local s = pandoc.utils.stringify(m)
    if s ~= "" then table.insert(ids, s) end
  end
  if #ids == 0 then return nil end

  local todos = ler_json("dados/painel/parceiros.json") or {}
  local por_id = {}
  for _, p in ipairs(todos) do por_id[p.id] = p end

  local entrada = (quarto.doc.input_file or ""):gsub(string.char(92), "/")
  -- páginas ficam em <pasta>/<item>/index.qmd: imagens do site estão dois níveis acima
  local ate_raiz = entrada:match("/[^/]+/[^/]+/index%.qmd$") and "../../" or ""

  local itens = {}
  for _, id in ipairs(ids) do
    local p = por_id[id]
    if p then
      local nome = tostring(p.nome):gsub("[_*]", "")
      local conteudo
      if valor(p.logo) then
        conteudo = '<img class="parceiro-faixa-logo" src="' .. esc(ate_raiz .. p.logo) .. '" alt="Logo de '
          .. esc(nome) .. '" title="' .. esc(nome) .. '" loading="lazy">'
      else
        conteudo = '<span class="parceiro-faixa-nome">' .. esc(nome) .. "</span>"
      end
      local site = valor(p.site)
      table.insert(itens, site and ('<a href="' .. esc(site) .. '" rel="noopener">' .. conteudo .. "</a>") or conteudo)
    end
  end
  if #itens == 0 then return nil end

  -- O Quarto usa a primeira imagem da página como capa nas listagens quando não há "image".
  -- Sem capa nem outras imagens, os logos abaixo virariam a capa: um marcador oculto, com a
  -- imagem genérica do tipo de página, passa a ser a primeira imagem ("preview-image").
  if doc.meta.image == nil then
    local tem_imagem = false
    doc:walk({ Image = function() tem_imagem = true end })
    if not tem_imagem then
      local generica = entrada:find("/noticias/", 1, true) and "sem-capa-noticia.svg"
        or entrada:find("/projetos/", 1, true) and "sem-capa-projeto.svg" or "sem-capa-evento.svg"
      doc.blocks:insert(pandoc.RawBlock("html",
        '<img class="preview-image" src="' .. ate_raiz .. "imagens/" .. generica .. '" alt="" hidden>'))
    end
  end

  doc.blocks:insert(pandoc.Header(2, "Parceiros", pandoc.Attr("parceiros-pagina")))
  doc.blocks:insert(pandoc.RawBlock("html",
    '<div class="parceiros-faixa" aria-label="Parceiros">' .. table.concat(itens) .. "</div>"))
  return doc
end
