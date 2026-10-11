hunger: 20 joy: 80 energy: 80 age: 0
clamp: func [n] [max 0 min 100 n]
mood: does [
    case [
        hunger > 80 ["😫"]
        energy < 20 ["😴"]
        joy < 30 ["😢"]
        true ["😊"]
    ]
]
update: does [
    pet/text: mood
    stats/text: rejoin ["Hunger " hunger "   Joy " joy "   Energy " energy "   Age " age]
    show pet
    show stats
]
theme/font-family: "Verdana, sans-serif"
append theme/css [button [border-radius 8]]
lay: layout [
    h2 "WebRebol pet"
    pet: text 300x100 "😊" css [font-size 72 text-align "center"] rate 1 on-time [
        hunger: clamp hunger + 3
        joy: clamp joy - 2
        energy: clamp energy - 1
        age: age + 1
        update
    ]
    stats: text 300 "..."
    across
    button 94 "Feed" [hunger: clamp hunger - 25 update]
    button 94 "Play" [joy: clamp joy + 20 energy: clamp energy - 10 update]
    button 94 "Sleep" [energy: clamp energy + 40 update]
]
update
view lay
