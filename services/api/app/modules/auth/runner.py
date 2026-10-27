"""Lifespan-owned worker. PostgreSQL, not this thread, owns delivery durability."""

import logging
from threading import Event, Thread

logger = logging.getLogger("provia.auth.worker")


class ManagedEmailWorker:
    def __init__(self, worker, poll_seconds):
        self.worker = worker
        self.poll_seconds = poll_seconds
        self.stopping = Event()
        self.thread = Thread(target=self._run, name="provia-auth-email", daemon=False)

    def start(self):
        self.thread.start()

    def stop(self):
        self.stopping.set()
        # Finish the bounded current attempt before disposing its database pool.
        # Forced host shutdown is recovered by the persisted job lease on restart.
        self.thread.join()

    def _run(self):
        failed = False
        while not self.stopping.is_set():
            try:
                self.worker.run_once()
            except Exception:
                # Do not log provider bodies, encrypted payloads or credentials.
                if not failed:
                    logger.warning("Auth email worker poll failed; pending jobs remain durable")
                failed = True
            else:
                if failed:
                    logger.info("Auth email worker polling recovered")
                failed = False
            self.stopping.wait(self.poll_seconds)
