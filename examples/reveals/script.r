names: [dissolve wipe blinds ripple melt sweep glitch burn rain punch printer cipher]
cards: copy []
play: func [card] [
    card/effect/run: 1 + select card/effect 'run
    show card
]
spec: copy [across]
count: 0
foreach name names [
    append spec compose/deep [
        box 200x150 20.24.36 [play face-of (to-lit-word name)]
    ]
    count: count + 1
    if count // 4 = 0 [append spec 'return]
]
face-of: func [name] [pick cards index? find names name]
sampler: layout spec
foreach card sampler/pane [append cards card]
repeat index length? names [
    card: pick cards index
    card/text: form pick names index
    grid: either index > 8 [20x15] [50x38]
    card/effect: make-reveal/text pick names index grid 90.60.160 "WebRebol runs REBOL in a page"
]
view sampler
