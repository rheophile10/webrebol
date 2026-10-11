REBOL [Title: "Writes the code and the ids of each category of errors, without the message texts"]
foreach category next first system/error [
    group: get in system/error category
    if object? group [print [category group/code skip first group 3]]
]
quit
