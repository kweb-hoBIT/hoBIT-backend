#!/usr/bin/env python3
"""
정기 수집 — 지금(5분 단위) 돌릴 일을 정함. beta.sh crawl-tick이 5분마다 부름 (crontab에는 이 한 줄만)

일정·켜 둔 대상은 관리자 사이트 > 챗봇 설정 > 정기 수집에서 바꾸고, 채팅 서버가 서버 안 주소로 줌.
채팅 서버가 꺼져 있으면 기본 일정(예전 crontab과 같음)으로 — 수집이 멈추지 않게.

출력: 돌릴 일 한 줄씩 (순서대로 실행) — quick | boards | all | static | rec-check
표준 라이브러리만 (서버 시스템 python3)
"""
from __future__ import annotations

import json
import sys
import urllib.request
from datetime import datetime

URL = "http://127.0.0.1:4100/api/v0/chat/internal/crawl-config?tick=1"
DEFAULT = {
    "schedule": {"quickMin": 15, "boardsHours": 3, "allTime": "04:30", "recDay": 0, "recTime": "05:40"},
    "sources": {"boards": True, "infoPages": True, "registrar": True, "campusLife": True, "customPages": True},
}


def load() -> dict:
    try:
        with urllib.request.urlopen(URL, timeout=5) as r:
            d = json.load(r)
        return {"schedule": {**DEFAULT["schedule"], **(d.get("schedule") or {})},
                "sources": {**DEFAULT["sources"], **(d.get("sources") or {})}}
    except Exception:
        return DEFAULT


def actions(now: datetime, cfg: dict) -> list[str]:
    s, src = cfg["schedule"], cfg["sources"]
    now = now.replace(minute=now.minute - now.minute % 5, second=0, microsecond=0)  # cron이 몇 초 늦게 떠도 같은 칸
    hm = now.strftime("%H:%M")
    mins = now.hour * 60 + now.minute
    out: list[str] = []
    # 전체 수집 — 정보대학 게시판을 껐으면 안내 페이지·학사일정·학교생활·FAQ만(static)
    if s.get("allTime") and s["allTime"] == hm:
        out.append("all" if src.get("boards", True) else "static")
    elif src.get("boards", True):
        bh = int(s.get("boardsHours") or 0)
        q = int(s.get("quickMin") or 0)
        if bh and now.minute == 20 and now.hour % bh == 0:
            out.append("boards")
        elif q and mins % q == 0:
            out.append("quick")
    # 일요일=0 (화면 기준) ↔ datetime.weekday() 월요일=0
    if int(s.get("recDay", -1)) >= 0 and (now.weekday() + 1) % 7 == int(s["recDay"]) and s.get("recTime") == hm:
        out.append("rec-check")
    return out


if __name__ == "__main__":
    when = datetime.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else datetime.now()
    print("\n".join(actions(when, load())))
