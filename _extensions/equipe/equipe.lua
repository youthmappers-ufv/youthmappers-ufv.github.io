--[[
  {{< equipe >}}: monta a página Equipe a partir de dados/painel/equipe.json,
  gerado por scripts/gerar-dados.ts. Cada seção (Coordenação, Diretoria,
  Equipe atual, Egressos e mandatos anteriores) só aparece se tiver pessoas.
  Novas seções de mandatos anteriores surgem sozinhas para cada cargo com
  "historico: true" em _data/vocabulario.yml.
]]
local comum = dofile(quarto.utils.resolve_path("comum.lua"))

local function esc(s)
  return (tostring(s or ""):gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"):gsub('"', "&quot;"))
end

local function cartao(p)
  local foto = (p.imagem and p.imagem ~= pandoc.json.null) and ("equipe/" .. p.imagem) or "equipe/fotos/avatar.svg"
  local selo = (p.selo and p.selo ~= pandoc.json.null and p.selo ~= "")
    and ('<span class="pessoa-selo">' .. esc(p.selo) .. "</span>") or ""
  return table.concat({
    '<a class="pessoa" href="equipe/', esc(p.id), '.html">',
    '<img class="pessoa-foto" src="', esc(foto), '" alt="Foto de ', esc(p.nome), '" loading="lazy">',
    '<span class="pessoa-nome">', esc(p.nome), "</span>",
    selo,
    '<span class="pessoa-desc">', esc(p.descricao), "</span>",
    "</a>",
  })
end

return {
  ["equipe"] = function()
    local dados = comum.dados_equipe()
    if not dados then
      quarto.log.warning("equipe: dados/painel/equipe.json não encontrado (rode quarto render)")
      return pandoc.Para({ pandoc.Str("Dados da equipe indisponíveis.") })
    end
    local blocos = {}
    for _, s in ipairs(dados.secoes) do
      if #s.pessoas > 0 then
        table.insert(blocos, pandoc.Header(2, s.titulo, pandoc.Attr(s.id)))
        if s.texto and s.texto ~= pandoc.json.null then
          table.insert(blocos, pandoc.Para(pandoc.Inlines(s.texto)))
        end
        local cartoes = {}
        for _, p in ipairs(s.pessoas) do table.insert(cartoes, cartao(p)) end
        table.insert(blocos, pandoc.RawBlock("html",
          '<div class="equipe-grade equipe-' .. s.estilo .. '">' .. table.concat(cartoes) .. "</div>"))
      end
    end
    return blocos
  end,
}
