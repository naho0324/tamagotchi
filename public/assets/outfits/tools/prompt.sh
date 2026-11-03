# usage: prompt c hair
declare -A COL=([1]=grey [2]=pink [3]=brown [4]=blond [5]=black [6]=black [7]=red)
declare -A HS=([pony]="a single high ponytail" [bob]="a short chin-length bob cut with bangs" [pigtail]="two twin pigtails tied on both sides" [afro]="a big round fluffy afro")
c=$1; h=$2; x=""
[ $c = 3 ] && x=" Keep the small purple octopus sitting on top of the head."
[ $c = 6 ] && x=" Keep the round bear ears visible on top of the head."
[ $c = 5 ] && x=" No cap or hat at all."
echo "Redraw the reference sprite row exactly: same character, same face and expression, same body proportions, same 6 outfits in the same order, same size and baseline, evenly spaced, plain flat light cream background, absolutely NO text. Change ONLY the hairstyle in all 6 copies to ${HS[$h]} in ${COL[$c]} hair color.$x Exactly 6 figures, front-facing, arms down. Chunky pixel art, visible square pixels, dark blue pixel outlines."
