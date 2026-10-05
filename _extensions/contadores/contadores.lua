--[[
  Contadores automáticos para a página inicial do YouthMappers UFV.

  Os números são calculados a cada renderização do site, a partir dos
  próprios arquivos do projeto. Uso no .qmd:

    {{< contar acoes >}}        eventos já realizados (pasta com data <= hoje)
    {{< contar estudantes >}}   pessoas com situacao: atual ou egresso
    {{< contar equipe-atual >}} pessoas com situacao: atual
    {{< contar parceiros >}}    logos em imagens/parceiros/
    {{< osm edits >}}           campo do arquivo dados/osm.json
    {{< atualizado >}}          data da última renderização

  Não depende de Python nem de pacotes: roda dentro do próprio Quarto.
]]

local function raiz()
  return (quarto.project and quarto.project.directory) or "."
end

local function listar(dir)
  local ok, itens = pcall(pandoc.system.list_directory, dir)
  if ok then return itens end
  return {}
end

local function ler(caminho)
  local f = io.open(caminho, "r")
  if not f then return nil end
  local texto = f:read("a")
  f:close()
  return texto
end

-- 12345 -> "12.345" (separador de milhar brasileiro)
local function formatar(n)
  local s = tostring(math.floor(n))
  local formatado = s:reverse():gsub("(%d%d%d)", "%1."):reverse()
  return (formatado:gsub("^%.", ""))
end

-- Eventos: pastas "AAAA-MM-DD-nome" com index.qmd e data até hoje.
-- Eventos futuros (já divulgados) não contam como "realizados".
local function contar_acoes()
  local dir = raiz() .. "/eventos"
  local hoje = os.date("%Y-%m-%d")
  local n = 0
  for _, nome in ipairs(listar(dir)) do
    local data = nome:match("^(%d%d%d%d%-%d%d%-%d%d)")
    if data and data <= hoje and ler(dir .. "/" .. nome .. "/index.qmd") then
      n = n + 1
    end
  end
  return n
end

-- Equipe: lê o campo "situacao:" do cabeçalho de cada arquivo.
local function contar_pessoas(situacoes)
  local dir = raiz() .. "/equipe"
  local n = 0
  for _, nome in ipairs(listar(dir)) do
    if nome:match("%.qmd$") then
      local texto = ler(dir .. "/" .. nome) or ""
      local sit = texto:match("\nsituacao:%s*([%w_]+)")
      if sit and situacoes[sit] then n = n + 1 end
    end
  end
  return n
end

-- Parceiros: um arquivo de logo por parceiro.
local function contar_parceiros()
  local n = 0
  for _, nome in ipairs(listar(raiz() .. "/imagens/parceiros")) do
    local ext = nome:lower():match("%.(%w+)$")
    if ext == "svg" or ext == "png" or ext == "jpg" or ext == "jpeg" or ext == "webp" then
      n = n + 1
    end
  end
  return n
end

local contadores = {
  ["acoes"]        = contar_acoes,
  ["estudantes"]   = function() return contar_pessoas({ atual = true, egresso = true }) end,
  ["equipe-atual"] = function() return contar_pessoas({ atual = true }) end,
  ["parceiros"]    = contar_parceiros,
}

return {
  ["contar"] = function(args)
    local alvo = pandoc.utils.stringify(args[1] or "")
    local f = contadores[alvo]
    if not f then
      quarto.log.warning("contadores: tipo desconhecido '" .. alvo .. "'")
      return pandoc.Str("?")
    end
    return pandoc.Str(formatar(f()))
  end,

  -- Lê um campo de dados/osm.json, gerado pela publicação automática.
  -- Aceita caminhos com ponto, ex.: {{< osm result.edits >}}
  ["osm"] = function(args)
    local campo = pandoc.utils.stringify(args[1] or "")
    local texto = ler(raiz() .. "/dados/osm.json")
    if not texto then return pandoc.Str("—") end
    local ok, dados = pcall(pandoc.json.decode, texto, false)
    if not ok or type(dados) ~= "table" then return pandoc.Str("—") end
    local valor = dados
    for parte in campo:gmatch("[^%.]+") do
      if type(valor) ~= "table" then valor = nil break end
      valor = valor[parte]
    end
    if type(valor) == "number" then return pandoc.Str(formatar(valor)) end
    if valor == nil then return pandoc.Str("—") end
    return pandoc.Str(tostring(valor))
  end,

  ["atualizado"] = function()
    return pandoc.Str(os.date("%d/%m/%Y"))
  end,
}
