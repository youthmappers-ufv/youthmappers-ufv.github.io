--[[
  {{< proximos >}}: destaque para os próximos eventos (data de hoje em diante).

  Opções:  limite="3"   número máximo de eventos (padrão 3)
           titulo="..." título da seção (padrão "Próximas ações")

  A lista é montada a cada publicação; no navegador, um pequeno script
  (agenda.js) esconde os eventos que já passaram desde então e calcula a
  contagem regressiva. Sem eventos futuros, a seção inteira não aparece.
]]
local comum = dofile(quarto.utils.resolve_path("comum.lua"))
local esc = comum.esc

return {
  ["proximos"] = function(_, kwargs)
    local agenda = comum.agenda()
    if not agenda then
      quarto.log.warning("proximos: dados/painel/agenda.json não encontrado")
      return pandoc.Null()
    end
    local limite = tonumber(pandoc.utils.stringify(kwargs.limite or "")) or 3
    local titulo = pandoc.utils.stringify(kwargs.titulo or "")
    if titulo == "" then titulo = "Próximas ações" end
    local hoje = os.date("%Y-%m-%d")
    local raiz = comum.ate_raiz()

    local cartoes = {}
    for _, ev in ipairs(agenda) do
      if ev.termina >= hoje and #cartoes < limite then
        local _, m, d = ev.data:match("(%d+)-(%d+)-(%d+)")
        local partes = { comum.quando(ev.data, ev.data_fim) }
        if ev.horario and ev.horario ~= pandoc.json.null then table.insert(partes, ev.horario) end
        if ev.lugar and ev.lugar ~= "" then table.insert(partes, ev.lugar) end
        local botoes = {}
        if ev.inscricao and ev.inscricao ~= pandoc.json.null then
          table.insert(botoes, '<a class="btn-mapa" href="' .. esc(ev.inscricao) .. '">Inscreva-se</a>')
        end
        table.insert(botoes, '<a class="btn-contorno" href="' .. esc(ev.google) .. '">Adicionar à agenda</a>')
        table.insert(cartoes, table.concat({
          '<article class="proximo" data-inicio="', esc(ev.data), '" data-termina="', esc(ev.termina), '">',
          '<div class="proximo-data" style="background:', esc(ev.cor), ";color:", esc(ev.cor_texto), '" aria-hidden="true">',
          '<span class="dia">', tonumber(d), '</span><span class="mes">', comum.MESES[tonumber(m)], "</span></div>",
          '<div class="proximo-corpo">',
          '<span class="proximo-tipo">', esc(ev.tipo_nome), '</span>',
          '<h3 class="proximo-titulo"><a href="', raiz, esc(ev.url), '">', esc(ev.titulo), "</a></h3>",
          '<p class="proximo-quando">', esc(table.concat(partes, " · ")), "</p>",
          '<p class="proximo-contagem" data-contagem></p>',
          '<div class="proximo-acoes">', table.concat(botoes), "</div>",
          "</div></article>",
        }))
      end
    end
    if #cartoes == 0 then return pandoc.Null() end

    comum.dependencia()
    return pandoc.Div({
      pandoc.Header(2, titulo, pandoc.Attr("proximas-acoes")),
      pandoc.RawBlock("html", '<div class="proximos-grade">' .. table.concat(cartoes) .. "</div>"),
    }, pandoc.Attr("", { "proximos" }, { ["data-proximos"] = "" }))
  end,
}
