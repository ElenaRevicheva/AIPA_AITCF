import json
with open(" atuona-state.json\, \r\) as f:
 state = json.load(f)
state[\bookState\][\currentPage\] = 70
state[\bookState\][\totalPages\] = 69
with open(\atuona-state.json\, \w\) as f:
 json.dump(state, f, indent=2, ensure_ascii=False)
print(\Fixed!\)
