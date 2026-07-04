# ~/workshops/aiweekend/harness/agents/concurrency.md — правила конкурентности

> Не только GIL. У Go (и других языков с настоящими потоками) реальный shared-memory параллелизм — гонки данных, дедлоки, потерянные апдейты. Агент лепит их «по аналогии».

## K1. Общее изменяемое состояние — под синхронизацией или не шарится
Любое поле, доступное из >1 горутины/потока: либо неизменяемо, либо под мьютексом/атомиком, либо передаётся через канал/очередь.
Профиль: Go `sync.Mutex`/`sync/atomic`/каналы · Python `threading.Lock` (GIL НЕ атомизирует `x+=1` над shared) · `<ВАШ_СТЕК>` — атомики/конкурентные коллекции/immutable.
**Eval:** стресс конкурентного доступа под детектором — Go `go test -race` exit 0 · Python: N потоков × M инкрементов == `N*M` детерминированно · `<ВАШ_СТЕК>` — конкуренси-стресс под race/interleaving-детектором.

## K2. Порядок захвата локов — глобальный
При ≥2 локах — фиксированный порядок; нет внешнего/агентского callback под локом; `tryLock` с таймаутом где возможна взаимная блокировка.
**Eval:** дедлок-стресс (A,B / B,A) с общим таймаутом завершается (зависание = fail); SpotBugs lock-ordering; thread dump при watchdog.

## K3. Отмена и утечки
Каждая фоновая горутина/поток/таск привязана к `context`/`StructuredTaskScope`/task group и завершается при отмене (не fire-and-forget).
**Eval:** число горутин/потоков до/после N циклов запрос-отмена не растёт (`runtime.NumGoroutine`/`ThreadMXBean`/`asyncio.all_tasks`).

## Пример: гонка данных (Go)
БЫЛО (`counter++` под сотней горутин — read-modify-write неатомарен):
```go
var counter int
var wg sync.WaitGroup
for i := 0; i < 100; i++ {
    wg.Add(1)
    go func() { defer wg.Done(); counter++ }()   // data race: go test -race краснеет, итог < 100
}
wg.Wait()
```
СТАЛО (атомарный RMW; `import "sync"`, `"sync/atomic"`):
```go
var counter int64
var wg sync.WaitGroup
for i := 0; i < 100; i++ {
    wg.Add(1)
    go func() { defer wg.Done(); atomic.AddInt64(&counter, 1) }()   // race-free
}
wg.Wait()
```
`counter++` неделим только на вид — под конкуренцией теряются инкременты, `go test -race` краснеет. `atomic.AddInt64` делает read-modify-write неделимым; при нескольких полях — `sync.Mutex`.

**Что запрещено агенту:** shared-запись без синхронизации; вложенные разнопорядковые локи; `create_task`/`go func` без привязки к отмене.
