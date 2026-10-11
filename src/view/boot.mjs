/**
 * The View mezzanines of WebRebol, as REBOL source text. A session evaluates them one time at its start.
 * The object `theme` has the parameters of the look. A script can change them.
 */
export const VIEW_BOOT = `
theme: make object! [
    font-family: "Arial, Helvetica, sans-serif"
    tags: [
        button "button" btn "button" toggle "button" rotary "button"
        field "input" info "input" area "textarea"
        check "input" radio "input" slider "input" progress "progress"
        choice "select" drop-down "select" image "img"
    ]
    types: [check "checkbox" radio "radio" slider "range"]
    colors: [button 44.80.132 toggle 44.80.132 field 255.255.255 info 240.240.240 area 255.255.255]
    css: [button [cursor "pointer"] btn [cursor "pointer"] toggle [cursor "pointer"]]
]

face-css: func [face /local css color] [
    css: reduce [
        'position "absolute" 'box-sizing "border-box" 'margin 0 'padding 0 'overflow "hidden"
        'left face/offset/x 'top face/offset/y 'width face/size/x 'height face/size/y
        'font-family theme/font-family
    ]
    if color: any [face/color select theme/colors face/style] [append css reduce ['background-color color]]
    if object? face/font [
        append css reduce ['font-size face/font/size 'color face/font/color 'text-align form face/font/align]
        if find form face/font/style "bold" [append css [font-weight "bold"]]
        if find form face/font/style "italic" [append css [font-style "italic"]]
    ]
    if object? face/edge [
        append css reduce ['border-style "solid" 'border-width face/edge/size/x 'border-color face/edge/color]
    ]
    foreach [name extra] theme/css [if name = face/style [append css extra]]
    if block? face/css [append css face/css]
    css
]

face-to-element: func [face /local tag props kids type] [
    tag: any [select theme/tags face/style "div"]
    props: reduce ['class join "wr-" form any [face/style 'window] 'style face-css face 'data-face face]
    kids: copy []
    either find ["input" "textarea"] tag [
        if face/text [append props reduce ['value face/text]]
        append props [data-oninput "text"]
    ] [
        if face/text [append kids face/text]
    ]
    if type: select theme/types face/style [append props reduce ['type type]]
    if block? face/action [append props reduce ['data-onclick face/action]]
    if block? face/on-time [append props reduce ['data-ontime face/on-time 'data-rate any [face/rate 10]]]
    if block? face/on-key [append props reduce ['data-onkey face/on-key]]
    if block? face/pane [foreach child face/pane [append kids face-to-element child]]
    element tag props kids
]
`;
