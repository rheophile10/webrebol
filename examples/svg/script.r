sales: [Jan 12 Feb 19 Mar 7 Apr 25 May 16 Jun 30]
bars: copy []
place: 0
foreach [month amount] sales [
    append bars element 'rect reduce [
        'x 30 + (place * 55) 'y 220 - (amount * 6) 'width 40 'height amount * 6
        'fill 40.110.220 'rx 4
    ] copy []
    append bars element 'text reduce [
        'x 50 + (place * 55) 'y 238 'text-anchor "middle" 'font-size 13 'fill 60.60.60
    ] reduce [form month]
    append bars element 'text reduce [
        'x 50 + (place * 55) 'y 214 - (amount * 6) 'text-anchor "middle" 'font-size 12 'fill 0.0.0
    ] reduce [form amount]
    place: place + 1
]
append bars element 'line [x1 20 y1 220 x2 370 y2 220 stroke 0.0.0 stroke-width 2] copy []
append bars element 'circle [cx 340 cy 40 r 22 fill 250.210.30 stroke 240.140.20 stroke-width 4] copy []
chart: element 'svg [width 380 height 250 viewBox "0 0 380 250"] bars
markup: form-element chart
write %chart.svg markup
note: rejoin ["The file has " size? %chart.svg " bytes."]
window: layout [
    h2 "An SVG picture made in REBOL"
    picture: box 380x250 255.255.255
    text 380 "The same picture as text. The script also wrote it to the file %chart.svg on the disk."
    area 380x120 markup
    text 380 note
]
picture/data: chart
view window
