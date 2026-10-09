--[[
  {{< agenda >}}: calendário de eventos (FullCalendar) com as opções para
  assinar a agenda do programa. Os eventos vêm de dados/painel/agenda.json,
  gerado por scripts/gerar-dados.ts; a agenda para assinar é o arquivo
  agenda.ics, publicado na raiz do site.
]]
local comum = dofile(quarto.utils.resolve_path("comum.lua"))

return {
  ["agenda"] = function()
    local raiz = comum.ate_raiz()
    quarto.doc.add_html_dependency({
      name = "fullcalendar", version = "6.1.15",
      scripts = { "fullcalendar/fullcalendar.min.js", "fullcalendar/pt-br.min.js" },
    })
    comum.dependencia()
    return pandoc.RawBlock("html", table.concat({
      '<div class="agenda-assinar">',
      "<p><strong>Receba os eventos do programa na sua agenda.</strong> ",
      "Ao assinar, cada novo evento publicado no site aparece sozinho no seu calendário.</p>",
      '<div class="agenda-botoes">',
      -- o endereço inicial (o próprio arquivo .ics) é trocado pelo script; links com "#"
      -- seriam reescritos pelos scripts de navegação do Quarto
      '<a class="btn-mapa" data-assinar="google" href="', raiz, 'agenda.ics">Assinar no Google Agenda</a>',
      --'<a class="btn-contorno" data-assinar="webcal" href="', raiz, 'agenda.ics">Assinar no Apple, Outlook ou celular</a>',
      '<button type="button" class="btn-contorno" data-assinar="copiar">Copiar o endereço da agenda</button>',
      "</div>",
      '<p class="agenda-endereco" data-assinar-endereco></p>',
      "</div>",
      '<div id="calendario" class="calendario" data-eventos="', raiz, 'dados/painel/agenda.json" ',
      'data-ics="', raiz, 'agenda.ics" data-raiz="', raiz, '"></div>',
      '<div class="calendario-legenda" data-legenda></div>',
    }))
  end,
}
