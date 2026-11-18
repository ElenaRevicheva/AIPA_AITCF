# Dashboard readers (17 Nov 2026): "Phrases you've collected" + "Introduce your family to EspaLuz"

Built on Elena's go (ascent `feeba55`, `739f7c9`, `4241f0d`; espaluz-chat + submit-progress deployed by CLI). Tested end to
end with a temporary test family on the local build against the LIVE functions (family deleted after, 0 rows left):
the tip named a real phrase in EN/ES/RU, "Practise with EspaLuz" filled the chat box, "Introduce your family" suggested
notes and saved exactly the ticked ones (`family_fact`, `via: family_video`).
First test found the photo reader noting "a pendant light above the table" and ES/RU tips built on the lamp; prompts
tightened to what the family does or loves (`739f7c9`); retest: "They are sharing a meal at the table".

| Section | EN | ES | RU |
|---|---|---|---|
| Phrases + tip: useful / trust / would use | 5 / 5 / yes | 2 / 3 / no | 3 / 3 / yes |
| Introduce your family: useful / trust / would use | 3 / 4 / yes | 3 / 4 / yes | 3 / 4 / yes |

What they asked: hear each phrase (EN, RU) -> listen button added (`4241f0d`); RU wants meanings in Russian (only English
is stored today - open); ES persona (native Spanish speaker) wants Panamanian local Spanish, not English meanings (the
English-coach direction exists; this section does not follow it yet - open). Family section: "show how a remembered note
turns into Spanish I practise" (open). Note: the ES/RU family reads used the English screenshot.
Raw: `2026-11-17_dashboard-readers.json`.
