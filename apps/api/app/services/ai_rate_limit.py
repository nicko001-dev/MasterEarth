"""Small per-process guard against accidental AI quota exhaustion."""

from collections import defaultdict, deque
from threading import Lock
from time import monotonic

WINDOW_SECONDS = 300
MAX_REQUESTS_PER_WINDOW = 8
_requests: dict[int | str, deque[float]] = defaultdict(deque)
_lock = Lock()


def allow_request(user_id: int | str) -> bool:
    now = monotonic()
    with _lock:
        recent = _requests[user_id]
        while recent and now - recent[0] >= WINDOW_SECONDS:
            recent.popleft()
        if len(recent) >= MAX_REQUESTS_PER_WINDOW:
            return False
        recent.append(now)
        if len(_requests) > 10_000:
            for stale_id in [
                key
                for key, times in _requests.items()
                if not times or now - times[-1] >= WINDOW_SECONDS
            ]:
                _requests.pop(stale_id, None)
        return True
