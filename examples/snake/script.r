cell: 15 dir: 1x0 snake: copy [5x5 4x5 3x5] food: 10x8 alive: true
make-part: func [pos color /local made] [
    made: layout [box 15x15]
    made: first made/pane
    made/offset: pos * cell
    made/color: color
    made
]
draw-board: does [
    clear next board/pane
    foreach part snake [append board/pane make-part part 60.200.80]
    append board/pane make-part food 220.50.50
    show board
]
turn: does [
    switch key [
        "ArrowUp" [if dir <> 0x1 [dir: 0x-1]]
        "ArrowDown" [if dir <> 0x-1 [dir: 0x1]]
        "ArrowLeft" [if dir <> 1x0 [dir: -1x0]]
        "ArrowRight" [if dir <> -1x0 [dir: 1x0]]
    ]
]
tick: does [
    if alive [
        head-pos: (first snake) + dir
        either any [head-pos/x < 0 head-pos/x > 19 head-pos/y < 0 head-pos/y > 19 find snake head-pos] [
            alive: false
            print ["Game over. Length:" length? snake]
        ] [
            insert snake head-pos
            either head-pos = food [
                food: as-pair (random 20) - 1 (random 20) - 1
            ] [
                remove back tail snake
            ]
        ]
        draw-board
    ]
]
board: layout [
    origin 0x0 space 0x0
    box 300x300 10.30.10 rate 8 on-time [tick] on-key [turn]
]
draw-board
view board
