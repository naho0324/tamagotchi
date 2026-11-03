# save.sh stage hair c:hash ...
A=/cursor/stores/store-90dfcf30-f60d-40c4-8a0b-814ba2dfda59/grok-bot/agents/0a8430ab-ab9f-4dce-afd8-0f0fd8d83e05/assets
cd /workspace/outfit_sprites; s=$1; h=$2; shift 2
for p in "$@"; do c=${p%%:*}; cp $A/${p##*:}*.jpg sheets/${c}_${s}_${h}.jpg; echo $c $(python3 tools/crop.py sheets/${c}_${s}_${h}.jpg $c $s $h); done
