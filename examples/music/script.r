tune-text: {X:1
T:Ode to Joy
M:4/4
L:1/4
Q:1/4=120
K:C
V:1
E E F G | G F E D | C C D E | E3/2 D/2 D2 |
E E F G | G F E D | C C D E | D3/2 C/2 C2 |
V:2
C,2 G,2 | C,2 G,2 | C,2 G,2 | C,2 G,2 |
C,2 G,2 | C,2 G,2 | C,2 G,2 | G,2 C,2 |
}
instruments: [
    soft [sine 1 0.6 sine 2 0.25 sine 3 0.1 fade 0.3 gap 0.1]
    organ [sine 1 0.5 sine 2 0.3 sine 4 0.2 fade 1 gap 0.05]
    chip [square 1 0.5 fade 0.6 gap 0.2]
]
play-with: func [name /local score] [
    score: abc-to-score tune/text
    play-score/with player score select instruments name
    status/text: rejoin [
        select score 'title ": " (length? select score 'notes) / 4 " notes, "
        length? get in player/data 'children " layers, " form name
    ]
    show status
]
window: layout [
    h2 "WebRebol music"
    text 440 "Write a tune in ABC notation. Then push a button to hear it."
    tune: area 440x230 tune-text
    across
    button 90 "Soft" [play-with 'soft]
    button 90 "Organ" [play-with 'organ]
    button 90 "Chip" [play-with 'chip]
    button 90 "Stop" [player/data: none show player]
    return
    status: text 440x24 ""
    return
    player: box 10x10
]
view window
