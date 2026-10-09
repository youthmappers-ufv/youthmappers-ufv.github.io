--[[
  {{< parceiros >}}        grade de cartões (logo, nome, tipo, ações e projetos em conjunto)
  {{< parceiros logos >}}  faixa só com os logos (parceiros com "logo")

  Lê dados/painel/parceiros.json, gerado por scripts/gerar-dados.ts a partir de
  _data/parceiros.yml. Parceiros com "ativo: false" não aparecem.
]]
local function raiz()
  return (quarto.project and quarto.project.directory) or "."
end

local function ler_json(caminho)
  local f = io.open(raiz() .. "/" .. caminho, "r")
  if not f then return nil end
  local texto = f:read("a")
  f:close()
  local ok, dados = pcall(pandoc.json.decode, texto, false)
  if ok then return dados end
  return nil
end

local function esc(s)
  return (tostring(s or ""):gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"):gsub('"', "&quot;"))
end

local function valor(v)
  if v == nil or v == pandoc.json.null or v == "" then return nil end
  return v
end

-- Nomes escritos em Markdown no YAML (ex.: _Campus_) viram texto simples
local function nome_limpo(s)
  return (tostring(s or ""):gsub("[_*]", ""))
end

local function plural(n, singular, plural_)
  return n .. " " .. (n == 1 and singular or plural_)
end

local function ativos()
  local dados = ler_json("dados/painel/parceiros.json")
  local vocab = ler_json("dados/painel/vocabulario.json")
  if not dados then
    quarto.log.warning("parceiros: dados/painel/parceiros.json não encontrado (rode quarto render)")
    return nil
  end
  local tipos = (vocab and vocab.tipos_parceiro) or {}
  local lista = {}
  for _, p in ipairs(dados) do
    if p.ativo ~= false then
      p.nome = nome_limpo(p.nome)
      p.tipo_nome = tipos[p.tipo] or p.tipo
      table.insert(lista, p)
    end
  end
  return lista
end

local function logo_img(p, classe)
  return '<img class="' .. classe .. '" src="' .. esc(p.logo) .. '" alt="Logo de ' .. esc(p.nome) .. '" loading="lazy">'
end

local function cartao(p)
  local logo = valor(p.logo)
  local site = valor(p.site)
  local midia
  if logo then
    midia = logo_img(p, "parceiro-logo")
  else
    midia = '<span class="parceiro-inicial" aria-hidden="true">' .. esc(pandoc.text.upper(pandoc.text.sub(p.nome, 1, 1))) .. "</span>"
  end
  local nome = site
    and ('<a href="' .. esc(site) .. '" rel="noopener">' .. esc(p.nome) .. "</a>")
    or esc(p.nome)
  local partes = {}
  local acoes, projetos = tonumber(p.acoes) or 0, tonumber(p.projetos) or 0
  if acoes > 0 then table.insert(partes, plural(acoes, "ação", "ações")) end
  if projetos > 0 then table.insert(partes, plural(projetos, "projeto", "projetos")) end
  local conjunto = #partes > 0
    and ('<span class="parceiro-conjunto">' .. table.concat(partes, " · ") .. " em conjunto</span>") or ""
  return table.concat({
    '<div class="parceiro">',
    '<div class="parceiro-midia">', midia, "</div>",
    '<span class="parceiro-nome">', nome, "</span>",
    '<span class="parceiro-tipo">', esc(p.tipo_nome), "</span>",
    conjunto,
    "</div>",
  })
end

local function faixa(lista)
  local itens = {}
  for _, p in ipairs(lista) do
    if valor(p.logo) then
      local img = logo_img(p, "parceiro-faixa-logo")
      local site = valor(p.site)
      table.insert(itens, site and ('<a href="' .. esc(site) .. '" rel="noopener">' .. img .. "</a>") or img)
    end
  end
  if #itens == 0 then return nil end
  return '<div class="parceiros-faixa" aria-label="Parceiros">' .. table.concat(itens) .. "</div>"
end

return {
  ["parceiros"] = function(args)
    local lista = ativos()
    if not lista or #lista == 0 then return pandoc.Null() end
    local modo = pandoc.utils.stringify(args[1] or "")
    local html
    if modo == "logos" then
      html = faixa(lista)
    else
      local cartoes = {}
      for _, p in ipairs(lista) do table.insert(cartoes, cartao(p)) end
      html = '<div class="parceiros-grade">' .. table.concat(cartoes) .. "</div>"
    end
    if not html then return pandoc.Null() end
    return pandoc.RawBlock("html", html)
  end,
}
