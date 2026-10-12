--[[
  {{< ficha >}}: monta a ficha de um evento ou projeto a partir do cabeçalho
  da própria página. Códigos viram nomes do vocabulário; membros e parceiros
  viram links. Linhas sem dados não aparecem.

  Personalização pelo cabeçalho:
    ficha:
      ocultar: [carga_horaria, equipe]     # linhas a esconder
      extras:                              # linhas a acrescentar (aceita Markdown)
        - rotulo: Inscrições
          valor: "[Formulário](https://...)"
]]

local function raiz() return (quarto.project and quarto.project.directory) or "." end

local function ler_json(rel)
  local f = io.open(raiz() .. "/" .. rel, "r")
  if not f then return {} end
  local t = f:read("a"); f:close()
  local ok, d = pcall(pandoc.json.decode, t, false)
  return ok and d or {}
end

local function txt(v)
  if v == nil then return nil end
  local s = pandoc.utils.stringify(v)
  if s == "" then return nil end
  return s
end

local function lista(v)
  local r = {}
  if v == nil then return r end
  if pandoc.utils.type(v) == "List" then
    for _, x in ipairs(v) do local s = txt(x); if s then table.insert(r, s) end end
  else
    local s = txt(v); if s then table.insert(r, s) end
  end
  return r
end

local MESES = { "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
                "agosto", "setembro", "outubro", "novembro", "dezembro" }
-- Aceita "2022-07-09" e "09/07/2022" (o Quarto reescreve a data do cabeçalho nesse formato)
local function partes_data(s)
  local a, m, d = (s or ""):match("^(%d%d%d%d)%-(%d%d)%-(%d%d)")
  if not a then d, m, a = (s or ""):match("^(%d%d)/(%d%d)/(%d%d%d%d)") end
  if not a then return nil end
  return tonumber(a), tonumber(m), tonumber(d)
end
local function data_extenso(s)                 -- "2022-07-09" -> "9 de julho de 2022"
  local a, m, d = partes_data(s)
  if not a then return s end
  return string.format("%d de %s de %d", d, MESES[m], a)
end
-- "12 a 14 de novembro de 2026" ou "30 de novembro a 2 de dezembro de 2026"
local function periodo_extenso(s0, s1)
  local a0, m0, d0 = partes_data(s0)
  local a1, m1, d1 = partes_data(s1)
  if not a0 then return s0 end
  if not a1 or (a1 == a0 and m1 == m0 and d1 == d0) then return data_extenso(s0) end
  if a1 == a0 and m1 == m0 then return string.format("%d a %d de %s de %d", d0, d1, MESES[m0], a0) end
  if a1 == a0 then return string.format("%d de %s a %d de %s de %d", d0, MESES[m0], d1, MESES[m1], a0) end
  return data_extenso(s0) .. " a " .. data_extenso(s1)
end
local function mes_extenso(s)                  -- "2026-03" -> "março de 2026"
  local a, m = (s or ""):match("^(%d%d%d%d)%-(%d%d)")
  if not a then return s end
  return string.format("%s de %s", MESES[tonumber(m)], a)
end

-- Minúsculas que respeitam acentos. O string.lower do Lua trabalha byte a
-- byte e, em alguns sistemas (como o Windows), corrompe letras acentuadas
-- em UTF-8 ("Híbrida" virava "h\xe3\xadbrida"). pandoc.text.lower entende UTF-8.
local function minusculas(s)
  return pandoc.text.lower(s or "")
end

local function md(texto)                       -- Markdown curto -> Inlines
  local doc = pandoc.read(texto or "", "markdown")
  if #doc.blocks == 0 then return pandoc.Inlines({}) end
  return doc.blocks[1].content or pandoc.Inlines(pandoc.utils.stringify(doc.blocks[1]))
end

local function juntar(itens, sep)              -- lista de Inlines -> Inlines "a, b e c"
  local r = pandoc.Inlines({})
  for i, x in ipairs(itens) do
    if i > 1 then r:insert(pandoc.Str(i == #itens and " e " or (sep or ", "))) end
    r:extend(x)
  end
  return r
end

local function hora_curta(h)                   -- "14:30" -> "14h30"; "14:00" -> "14h"
  local hh, mm = (h or ""):match("^(%d+):(%d%d)$")
  if not hh then return nil end
  return tonumber(hh) .. "h" .. (mm == "00" and "" or mm)
end

return {
  ["ficha"] = function(_, _, meta)
    local vocab = ler_json("dados/painel/vocabulario.json")
    local refs = ler_json("dados/painel/referencias.json")
    local membros = refs.membros or {}
    local parceiros = refs.parceiros or {}
    local entrada = quarto.doc.input_file or ""
    local eh_projeto = entrada:match("[/\\]projetos[/\\]") ~= nil
    local eh_noticia = entrada:match("[/\\]noticias[/\\]") ~= nil
    -- páginas de eventos e projetos ficam em <pasta>/<item>/index.qmd
    local ate_raiz = "../../"

    local ocultar = {}
    if meta.ficha and meta.ficha.ocultar then
      for _, k in ipairs(lista(meta.ficha.ocultar)) do ocultar[k] = true end
    end

    local linhas = {}
    local function linha(chave, rotulo, conteudo)
      if ocultar[chave] or conteudo == nil or #conteudo == 0 then return end
      table.insert(linhas, { pandoc.Inlines(rotulo), { pandoc.Plain(conteudo) } })
    end
    local function nome_voc(dominio, codigo)
      local d = vocab[dominio] or {}
      return codigo and d[codigo] and tostring(d[codigo]) or codigo
    end
    local function pessoas(ids)
      local r = {}
      for _, id in ipairs(ids) do
        local nome = membros[id]
        if nome then
          table.insert(r, pandoc.Inlines({ pandoc.Link(nome, ate_raiz .. "equipe/" .. id .. ".qmd") }))
        else
          table.insert(r, pandoc.Inlines(id))
        end
      end
      return #r > 0 and juntar(r) or nil
    end
    local function lista_parceiros(ids)
      local r = {}
      for _, id in ipairs(ids) do
        local p = parceiros[id]
        if p and p.site and p.site ~= pandoc.json.null then
          table.insert(r, pandoc.Inlines({ pandoc.Link(p.nome, p.site) }))
        else
          table.insert(r, pandoc.Inlines(p and p.nome or id))
        end
      end
      return #r > 0 and juntar(r) or nil
    end
    local function tarefas()
      local r = {}
      if meta.tarefas then
        for _, t in ipairs(meta.tarefas) do
          local u = txt(t.url)
          local nome = txt(t.texto) or nome_voc("ferramentas_tarefas", txt(t.ferramenta))
          if u and nome then table.insert(r, pandoc.Inlines({ pandoc.Link(nome, u) })) end
        end
      end
      return #r > 0 and juntar(r, " · ") or nil
    end
    local function links()
      local r = {}
      if meta.links then
        for _, l in ipairs(meta.links) do
          local t, u = txt(l.texto), txt(l.url)
          if t and u then table.insert(r, pandoc.Inlines({ pandoc.Link(t, u) })) end
        end
      end
      return #r > 0 and juntar(r, " · ") or nil
    end

    if eh_noticia then
      -- ---------------- notícia ----------------
      local data = data_extenso(txt(meta.date))
      if data then linha("data", "Data", pandoc.Inlines(data)) end
      local cats = {}
      for _, c in ipairs(lista(meta.categories)) do
        table.insert(cats, pandoc.Inlines(pandoc.text.upper(pandoc.text.sub(c, 1, 1)) .. pandoc.text.sub(c, 2)))
      end
      if #cats > 0 then linha("categoria", "Categoria", juntar(cats)) end
      local partes = {}
      local lugar, mun = txt(meta["local"]), txt(meta.municipio)
      if lugar then table.insert(partes, lugar) end
      if mun then table.insert(partes, mun) end
      if #partes > 0 then linha("local", "Local", pandoc.Inlines(table.concat(partes, ", "))) end
      linha("equipe", "Equipe presente", pessoas(lista(meta.equipe)))
    elseif not eh_projeto then
      -- ---------------- evento ----------------
      -- dados calculados por scripts/gerar-dados.ts (agenda.json): carga horária derivada, calendário
      local id = entrada:gsub("\\", "/"):match("/eventos/([^/]+)/index%.qmd$")
      local ev = nil
      for _, x in ipairs(ler_json("dados/painel/agenda.json")) do if x.id == id then ev = x end end
      local hi, hf = hora_curta(txt(meta.hora_inicio)), hora_curta(txt(meta.hora_fim))
      -- data (e data_fim, nos eventos de mais de um dia) por extenso, a partir do cabeçalho
      local d0 = ev and ev.data or txt(meta.date)
      local d1 = ev and ev.data_fim ~= pandoc.json.null and ev.data_fim or txt(meta.data_fim)
      local data = periodo_extenso(d0, d1)
      if data then
        local h = hi and (hf and (", das " .. hi .. " às " .. hf) or (", às " .. hi)) or ""
        linha("data", "Data", pandoc.Inlines(data .. h))
      end

      local tipo = nome_voc("tipos_evento", txt(meta.tipo))
      local modal = txt(meta.modalidade)
      if tipo then
        linha("tipo", "Formato", pandoc.Inlines(tipo .. (modal and (", " .. minusculas(nome_voc("modalidades", modal))) or "")))
      end
      -- Ações coorganizadas: "Coorganização"; organização própria não precisa de linha
      local papel = txt(meta.papel)
      if papel and papel ~= "organizacao" then
        linha("realizacao", "Realização", pandoc.Inlines(nome_voc("papeis", papel)))
      end

      -- Em ações remotas, o município não descreve o local da atividade
      local partes = {}
      local mun = (modal ~= "remota") and txt(meta.municipio) or nil
      -- (sem ipairs: ele para no primeiro valor ausente)
      local lugar = txt(meta["local"])
      if lugar then table.insert(partes, lugar) end
      if mun then table.insert(partes, mun) end
      if #partes > 0 then linha("local", "Local", pandoc.Inlines(table.concat(partes, ", "))) end
      local area = txt(meta.area_mapeada)
      if area then linha("area_mapeada", "Área mapeada", pandoc.Inlines(area)) end

      -- carga horária (minutos): informada ou, se ausente, calculada do horário
      local ch = tonumber(txt(meta.carga_horaria)) or (ev and tonumber(ev.carga_horaria_min))
      if ch then
        ch = math.floor(ch)
        linha("carga_horaria", "Carga horária", pandoc.Inlines(ch .. (ch == 1 and " minuto" or " minutos")))
      end

      local pub, ext = tonumber(txt(meta.publico)), tonumber(txt(meta.publico_externo))
      if pub then
        local s = pub .. (pub == 1 and " pessoa" or " pessoas")
        if ext and ext > 0 then s = s .. ", das quais " .. ext .. " da comunidade externa" end
        linha("publico", "Participantes", pandoc.Inlines(s))
      end
      linha("equipe", "Equipe do programa", pessoas(lista(meta.equipe)))

      -- Eventos futuros: inscrição e "adicionar à agenda" (dados de agenda.json)
      if ev and ev.ics and ev.termina >= os.date("%Y-%m-%d") then
        local insc = txt(meta.inscricao)
        if insc then
          linha("inscricao", "Inscrições", pandoc.Inlines({ pandoc.Link("Formulário de inscrição", insc) }))
        end
        linha("agenda", "Agenda", pandoc.Inlines({
          pandoc.Link("Adicionar à Agenda Google", ev.google), pandoc.Str(" · "),
          pandoc.Link("outros calendários (.ics)", ate_raiz .. ev.ics) }))
      end
    else
      -- ---------------- projeto ----------------
      local tipo = txt(meta.tipo)
      if tipo then linha("tipo", "Tipo", pandoc.Inlines("Projeto de " .. minusculas(nome_voc("tipos_projeto", tipo)))) end
      local ini, fim = txt(meta.inicio), txt(meta.fim)
      if ini then
        linha("periodo", "Período", pandoc.Inlines(mes_extenso(ini) .. (fim and (" a " .. mes_extenso(fim)) or " até hoje")))
        linha("situacao", "Situação", pandoc.Inlines(fim and "Concluído" or "Em andamento"))
      end
      linha("coordenacao", "Coordenação", pessoas(lista(meta.coordenacao)))
      linha("equipe", "Equipe", pessoas(lista(meta.equipe)))
      local ods = {}
      for _, o in ipairs(lista(meta.ods)) do
        table.insert(ods, pandoc.Inlines(o .. ". " .. nome_voc("ods", o)))
      end
      if #ods > 0 then linha("ods", "ODS", juntar(ods, "; ")) end
    end

    -- Parceiros: seção própria no fim da página (filtro "parceiros"), não entram na ficha
    linha("tarefas", "Tarefas de mapeamento", tarefas())
    linha("links", "Links", links())

    if meta.ficha and meta.ficha.extras then
      for _, x in ipairs(meta.ficha.extras) do
        local r, v = txt(x.rotulo), txt(x.valor)
        if r and v then table.insert(linhas, { pandoc.Inlines(r), { pandoc.Plain(md(v)) } }) end
      end
    end

    if #linhas == 0 then return pandoc.Null() end
    return pandoc.Div({ pandoc.DefinitionList(linhas) }, pandoc.Attr("", { "ficha" }))
  end,
}
